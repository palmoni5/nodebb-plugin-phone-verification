'use strict';

const crypto = require('crypto');

// NodeBB modules
let db;
let User;
let meta;
let SocketPlugins; // הוספנו משתנה עבור Socket.io

const plugin = {};

// קבועים
const CODE_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const BLOCK_DURATION_MINUTES = 15;
const PHONE_FIELD_KEY = 'phoneNumber';
const DEBUG_SKIP_VERIFICATION = false; 
const REDIS_PREFIX = 'phone-verification:code:';
const IP_RATE_LIMIT_PREFIX = 'phone-verification:ip:';
const MAX_REQUESTS_PER_IP = 10;
const IP_BLOCK_HOURS = 24;

// ==================== הגדרות ברירת מחדל ====================
const defaultSettings = {
    voiceServerUrl: 'https://www.call2all.co.il/ym/api/RunCampaign',
    voiceServerApiKey: '',
    voiceServerEnabled: false,
    blockUnverifiedUsers: false,
    voiceTtsMode: '1',
    voiceMessageTemplate: 'הקוד שלך לאתר {siteTitle} הוא {code} אני חוזר. הקוד הוא {code}'
};

// ==================== פונקציות עזר ====================

plugin.validatePhoneNumber = function (phone) {
    if (!phone || typeof phone !== 'string') return false;
    const cleanPhone = phone.replace(/[-\s]/g, '');
    const phoneRegex = /^05\d{8}$/;
    return phoneRegex.test(cleanPhone);
};

plugin.normalizePhone = function (phone) {
    if (!phone || typeof phone !== 'string') return '';
    return phone.replace(/[-\s]/g, '');
};

plugin.generateVerificationCode = function () {
    const randomBytes = crypto.randomBytes(3);
    const number = randomBytes.readUIntBE(0, 3) % 1000000;
    return number.toString().padStart(6, '0');
};

plugin.hashCode = function (code) {
    return crypto.createHash('sha256').update(code).digest('hex');
};

plugin.formatCodeForSpeech = function (code) {
    return code.split('').join(' ');
};

// ==================== בדיקת הרשאות פרסום ====================

plugin.checkPostingPermissions = async function (data) {
    const uid = data.uid || (data.post && data.post.uid) || (data.topic && data.topic.uid);

    // אורחים או מערכת - דלג
    if (!uid || parseInt(uid, 10) === 0) return data;

    const settings = await plugin.getSettings();
    if (!settings.blockUnverifiedUsers) return data;

    const isAdmin = await User.isAdministrator(uid);
    if (isAdmin) return data;

    const phoneData = await plugin.getUserPhone(uid);

    if (!phoneData || !phoneData.phoneVerified) {
        const userSlug = await User.getUserField(uid, 'userslug');
        const editUrl = userSlug ? `/user/${userSlug}/edit` : '/user/me/edit';
        
        throw new Error('חובה לאמת מספר טלפון כדי להמשיך את הפעילות בפורום.<br/>' + 
                        'אנא גש ל<a href="' + editUrl + '" target="_blank">הגדרות הפרופיל שלך</a> ולחץ על "הוסף מספר טלפון".');
    }

    return data;
};

// ==================== בדיקת הרשאות הצבעה ====================

plugin.checkVotingPermissions = async function (data) {
    const uid = data.uid;

    if (!uid || parseInt(uid, 10) === 0) return data;

    const settings = await plugin.getSettings();
    if (!settings.blockUnverifiedUsers) return data;

    const isAdmin = await User.isAdministrator(uid);
    if (isAdmin) return data;

    const phoneData = await plugin.getUserPhone(uid);

    if (!phoneData || !phoneData.phoneVerified) {
        const userSlug = await User.getUserField(uid, 'userslug');
        const editUrl = userSlug ? `/user/${userSlug}/edit` : '/user/me/edit';
        
        throw new Error('חובה לאמת מספר טלפון כדי להמשיך את הפעילות בפורום.<br/>' + 
                        'אנא גש ל<a href="' + editUrl + '" target="_blank">הגדרות הפרופיל שלך</a> ולחץ על "הוסף מספר טלפון".');
    }

    return data;
};

// ==================== שליחת שיחה קולית ====================

plugin.sendVoiceCall = async function (phone, code) {
    const settings = await plugin.getSettings();
    
    if (!meta) meta = require.main.require('./src/meta');
    const siteTitle = meta.config.title || 'האתר';

    if (!settings.voiceServerEnabled || !settings.voiceServerApiKey) {
        return { success: false, error: 'VOICE_SERVER_DISABLED', message: 'שרת השיחות הקוליות לא מוגדר' };
    }

    try {
        const spokenCode = plugin.formatCodeForSpeech(code);
        let messageText = settings.voiceMessageTemplate || defaultSettings.voiceMessageTemplate;
        
        messageText = messageText.replace(/{code}/g, spokenCode)
                                 .replace(/{siteTitle}/g, siteTitle);

        const phonesData = {};
        phonesData[phone] = {
            name: 'משתמש',
            moreinfo: messageText,
            blocked: false
        };

        const baseUrl = settings.voiceServerUrl || defaultSettings.voiceServerUrl;
        const ttsMode = settings.voiceTtsMode || defaultSettings.voiceTtsMode;

        const params = new URLSearchParams({
            ttsMode: ttsMode,
            phones: JSON.stringify(phonesData),
            token: settings.voiceServerApiKey
        });

        const url = `${baseUrl}?${params.toString()}`;
        
        const response = await fetch(url, { method: 'GET' });

        if (!response.ok) return { success: false, error: 'VOICE_SERVER_ERROR', message: 'שגיאה בשרת השיחות הקוליות' };

        const result = await response.json();
        if (result.responseStatus === 'OK' || result.responseStatus === 'WAITING') {
            return { success: true, result };
        } else {
            return { success: false, error: 'VOICE_SERVER_ERROR', message: result.message || 'שגיאה בשליחת השיחה' };
        }
    } catch (err) {
        console.error(err);
        return { success: false, error: 'VOICE_SERVER_ERROR', message: 'שגיאה בהתחברות לשרת השיחות הקוליות' };
    }
};

// ==================== Redis Logic ====================

plugin.saveVerificationCode = async function (phone, code) {
    const normalizedPhone = plugin.normalizePhone(phone);
    const now = Date.now();
    const expiresAt = now + (CODE_EXPIRY_MINUTES * 60 * 1000);
    const key = `${REDIS_PREFIX}${normalizedPhone}`;
    
    if (!db) return { success: false, error: 'DB_ERROR', message: 'שגיאת מערכת' };
    
    const existing = await db.getObject(key);
    if (existing && existing.blockedUntil && parseInt(existing.blockedUntil, 10) > now) {
        const remainingMinutes = Math.ceil((parseInt(existing.blockedUntil, 10) - now) / 60000);
        return { success: false, error: 'PHONE_BLOCKED', message: `המספר חסום זמנית, נסה שוב בעוד ${remainingMinutes} דקות` };
    }
    
    const data = { hashedCode: plugin.hashCode(code), attempts: 0, createdAt: now, expiresAt: expiresAt, blockedUntil: 0 };
    await db.setObject(key, data);
    await db.pexpireAt(key, now + (20 * 60 * 1000));
    return { success: true, expiresAt };
};

plugin.verifyCode = async function (phone, code) {
    const normalizedPhone = plugin.normalizePhone(phone);
    const now = Date.now();
    const key = `${REDIS_PREFIX}${normalizedPhone}`;
    
    if (!db) return { success: false, error: 'DB_ERROR', message: 'שגיאת מערכת' };
    const data = await db.getObject(key);
    
    if (!data) return { success: false, error: 'CODE_NOT_FOUND', message: 'לא נמצא קוד אימות למספר זה' };
    if (data.blockedUntil && parseInt(data.blockedUntil, 10) > now) {
        const remainingMinutes = Math.ceil((parseInt(data.blockedUntil, 10) - now) / 60000);
        return { success: false, error: 'PHONE_BLOCKED', message: `המספר חסום זמנית, נסה שוב בעוד ${remainingMinutes} דקות` };
    }
    if (parseInt(data.expiresAt, 10) < now) return { success: false, error: 'CODE_EXPIRED', message: 'קוד האימות פג תוקף' };
    
    if (plugin.hashCode(code) === data.hashedCode) {
        await db.delete(key);
        return { success: true };
    }
    
    const attempts = parseInt(data.attempts, 10) + 1;
    if (attempts >= MAX_ATTEMPTS) {
        const blockedUntil = now + (BLOCK_DURATION_MINUTES * 60 * 1000);
        await db.setObjectField(key, 'blockedUntil', blockedUntil);
        await db.setObjectField(key, 'attempts', attempts);
        return { success: false, error: 'PHONE_BLOCKED', message: `המספר נחסם ל-${BLOCK_DURATION_MINUTES} דקות עקב ניסיונות כושלים` };
    }
    await db.setObjectField(key, 'attempts', attempts);
    return { success: false, error: 'CODE_INVALID', message: `קוד האימות שגוי. נותרו ${MAX_ATTEMPTS - attempts} ניסיונות` };
};

plugin.checkIpRateLimit = async function (ip) {
    if (!db || !ip) return { allowed: true };
    const key = `${IP_RATE_LIMIT_PREFIX}${ip}`;
    const count = await db.get(key);
    if (count && parseInt(count, 10) >= MAX_REQUESTS_PER_IP) {
        return { allowed: false, error: 'IP_BLOCKED', message: 'חרגת ממספר הבקשות המותר. נסה שוב מאוחר יותר.' };
    }
    return { allowed: true };
};

plugin.incrementIpCounter = async function (ip) {
    if (!db || !ip) return;
    const key = `${IP_RATE_LIMIT_PREFIX}${ip}`;
    const exists = await db.exists(key);
    await db.increment(key);
    if (!exists) await db.pexpireAt(key, Date.now() + (IP_BLOCK_HOURS * 60 * 60 * 1000));
};

plugin.markPhoneAsVerified = async function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    if (!db) return;
    const key = `phone-verification:verified:${normalizedPhone}`;
    await db.set(key, Date.now());
    await db.pexpireAt(key, Date.now() + (600 * 1000)); 
};

plugin.isPhoneVerified = async function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    if (!db) return false;
    const key = `phone-verification:verified:${normalizedPhone}`;
    const verifiedAt = await db.get(key);
    if (!verifiedAt) return false;
    if (Date.now() - verifiedAt > 600000) { await db.delete(key); return false; }
    return true;
};

plugin.clearVerifiedPhone = async function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    if (db) await db.delete(`phone-verification:verified:${normalizedPhone}`);
};

// ==================== DB Functions ====================

plugin.isPhoneExists = async function (phone) {
    if (!db) return false;
    const normalizedPhone = plugin.normalizePhone(phone);
    const uid = await db.sortedSetScore('phone:uid', normalizedPhone);
    return !!uid;
};

// תיקון: בדיקת כפילות לא תכשיל אם המשתמש הוא הבעלים של המספר
plugin.savePhoneToUser = async function (uid, phone, verified = true) {
    if (!db || !User) return { success: false };
    
    // אם לא הועבר טלפון (במקרה של אימות ידני ללא מספר)
    if (!phone) {
        await User.setUserFields(uid, {
            phoneVerified: verified ? 1 : 0,
            phoneVerifiedAt: verified ? Date.now() : 0
        });
        // הסרה מאינדקס אם היה קיים בעבר
        const oldPhoneData = await plugin.getUserPhone(uid);
        if (oldPhoneData && oldPhoneData.phone) {
            await db.sortedSetRemove('phone:uid', oldPhoneData.phone);
            await db.sortedSetRemove('users:phone', uid);
        }
        return { success: true };
    }

    const normalizedPhone = plugin.normalizePhone(phone);
    const existingUid = await db.sortedSetScore('phone:uid', normalizedPhone);
    
    // בדיקה: אם המספר קיים ושיך למשתמש אחר
    if (existingUid && parseInt(existingUid, 10) !== parseInt(uid, 10)) {
        return { success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום במערכת למשתמש אחר' };
    }

    const now = Date.now();
    await User.setUserFields(uid, {
        [PHONE_FIELD_KEY]: normalizedPhone,
        phoneVerified: verified ? 1 : 0,
        phoneVerifiedAt: verified ? now : 0
    });
    
    // עדכון האינדקסים (דורס אם קיים, שזה בסדר כי וידאנו שזה אותו משתמש)
    await db.sortedSetAdd('phone:uid', uid, normalizedPhone);
    await db.sortedSetAdd('users:phone', now, uid);
    return { success: true };
};

plugin.getUserPhone = async function (uid) {
    if (!User) return null;
    const userData = await User.getUserFields(uid, [PHONE_FIELD_KEY, 'phoneVerified', 'phoneVerifiedAt']);
    // מאפשר להחזיר אובייקט גם אם אין טלפון, כל עוד יש שדות (למקרה של מאומת ללא טלפון)
    if (!userData) return null;
    return {
        phone: userData[PHONE_FIELD_KEY] || '',
        phoneVerified: parseInt(userData.phoneVerified, 10) === 1,
        phoneVerifiedAt: parseInt(userData.phoneVerifiedAt, 10) || null
    };
};

plugin.findUserByPhone = async function (phone) {
    if (!db) return null;
    const normalizedPhone = plugin.normalizePhone(phone);
    const uid = await db.sortedSetScore('phone:uid', normalizedPhone);
    return uid ? parseInt(uid, 10) : null;
};

plugin.getAllUsersWithPhones = async function (start = 0, stop = 49) {
    if (!db || !User) return { users: [], total: 0 };
    
    // אנו שואבים משתמשים לפי מי שיש לו שדה phoneVerified=1 או נמצא ברשימת הטלפונים
    // הדרך היעילה ב-NodeBB היא להשתמש ב-Set שיצרנו 'users:phone'. 
    // אך עבור משתמשים מאומתים ללא טלפון, נצטרך לוגיקה נוספת או להוסיף אותם ל-Set גם כן.
    // לצורך פשטות: אנו מניחים שמי שמאומת נמצא ב-users:phone, גם אם בלי מספר (נצטרך לוודא זאת בהוספה).
    
    const total = await db.sortedSetCard('users:phone');
    const uids = await db.getSortedSetRange('users:phone', start, stop);
    
    if (!uids || !uids.length) return { users: [], total };
    
    const users = await User.getUsersFields(uids, ['uid', 'username', PHONE_FIELD_KEY, 'phoneVerified', 'phoneVerifiedAt']);
    
    const usersList = users.map(u => ({
        uid: u.uid,
        username: u.username,
        phone: u[PHONE_FIELD_KEY] || '',
        phoneVerified: parseInt(u.phoneVerified, 10) === 1,
        phoneVerifiedAt: parseInt(u.phoneVerifiedAt, 10) || null
    }));
    
    return { users: usersList, total };
};

// ==================== Hooks Implementation ====================

plugin.checkRegistration = async function (data) {
    const phoneNumber = data.req.body.phoneNumber;
    if (!phoneNumber) throw new Error('חובה להזין מספר טלפון');
    const cleanPhone = plugin.normalizePhone(phoneNumber);
    if (!plugin.validatePhoneNumber(cleanPhone)) throw new Error('מספר הטלפון אינו תקין');
    
    const normalizedPhone = plugin.normalizePhone(phoneNumber);
    const existingUid = await plugin.isPhoneExists(normalizedPhone);
    
    // בדיקת כפילות בהרשמה - כאן זה קריטי כי המשתמש עדיין לא קיים
    if (existingUid) throw new Error('מספר הטלפון כבר רשום במערכת');
    
    if (DEBUG_SKIP_VERIFICATION) {
        data.userData.phoneNumber = normalizedPhone;
        return data;
    }
    
    const isVerified = await plugin.isPhoneVerified(normalizedPhone);
    if (!isVerified) throw new Error('יש לאמת את מספר הטלפון לפני ההרשמה');
    
    data.userData.phoneNumber = normalizedPhone;
    return data;
};

plugin.userCreated = async function (data) {
    const { user } = data;
    const phoneNumber = data.data.phoneNumber;
    if (phoneNumber && user && user.uid) {
        await plugin.savePhoneToUser(user.uid, phoneNumber, true);
        await plugin.clearVerifiedPhone(phoneNumber);
    }
};

plugin.addAdminNavigation = async function (header) {
    if (header.plugins) {
        header.plugins.push({ route: '/plugins/phone-verification', icon: 'fa-phone', name: 'אימות טלפון' });
    }
    return header;
};

plugin.whitelistFields = async function (data) {
    data.whitelist.push(PHONE_FIELD_KEY, 'phoneVerified', 'phoneVerifiedAt', 'showPhone');
    return data;
};

plugin.addPhoneToAccount = async function (data) {
    if (data.userData && data.userData.uid) {
        const phoneData = await plugin.getUserPhone(data.userData.uid);
        if (phoneData) {
            data.userData.phoneNumber = phoneData.phone;
            data.userData.phoneVerified = phoneData.phoneVerified;
        }
        const showPhone = await db.getObjectField(`user:${data.userData.uid}`, 'showPhone');
        data.userData.showPhone = showPhone === '1' || showPhone === 1;
    }
    return data;
};

plugin.loadScript = async function (data) {
    const pagesToLoad = ['register', 'account/edit', 'account/profile'];
    
    if (pagesToLoad.includes(data.tpl_url) || pagesToLoad.includes(data.tpl)) {
        if (!data.scripts.includes('forum/phone-verification')) {
            data.scripts.push('forum/phone-verification');
        }
    }
    return data;
};

plugin.init = async function (params) {
    const { router, middleware } = params;
    db = require.main.require('./src/database');
    User = require.main.require('./src/user');
    meta = require.main.require('./src/meta');
    SocketPlugins = require.main.require('./src/socket.io/plugins');
    
    // --- הגדרת Socket.io Events לממשק הניהול ---
    SocketPlugins.call2all = {};

    // 1. הוספת משתמש מאומת (עם או בלי טלפון)
    SocketPlugins.call2all.adminAddVerifiedUser = async function (socket, data) {
        if (!data || !data.uid) throw new Error('חסר מזהה משתמש');
        
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');

        // אם הוזן טלפון, נרמל אותו
        let phone = null;
        if (data.phone && data.phone.trim().length > 0) {
            if (!plugin.validatePhoneNumber(data.phone)) throw new Error('מספר הטלפון אינו תקין');
            phone = data.phone;
        }

        // שימוש בפונקציה המרכזית שדואגת לעדכון ה-DB, מחיקת כפילויות וכו'
        const result = await plugin.savePhoneToUser(data.uid, phone, true);
        
        // אם הוספנו משתמש ללא טלפון, עלינו לוודא שהוא נכנס לרשימה הראשית (Sorted Set) כדי שיופיע בטבלה
        if (!phone && result.success) {
            await db.sortedSetAdd('users:phone', Date.now(), data.uid);
        }

        if (!result.success) throw new Error(result.message);
    };

    // 2. אימות ידני למשתמש קיים
    SocketPlugins.call2all.adminVerifyUser = async function (socket, data) {
        if (!data || !data.uid) throw new Error('חסר מזהה משתמש');
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');

        await User.setUserFields(data.uid, {
            phoneVerified: 1,
            phoneVerifiedAt: Date.now()
        });
        // עדכון ברשימה הראשית למקרה שלא היה שם
        await db.sortedSetAdd('users:phone', Date.now(), data.uid);
    };

    // 3. ביטול אימות
    SocketPlugins.call2all.adminUnverifyUser = async function (socket, data) {
        if (!data || !data.uid) throw new Error('חסר מזהה משתמש');
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');

        await User.setUserFields(data.uid, {
            phoneVerified: 0,
            phoneVerifiedAt: 0
        });
    };

    // 4. מחיקת טלפון (והסרה מהרשימה)
    SocketPlugins.call2all.adminDeleteUserPhone = async function (socket, data) {
        if (!data || !data.uid) throw new Error('חסר מזהה משתמש');
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');

        const phoneData = await plugin.getUserPhone(data.uid);
        
        // מחיקה מהאינדקסים
        if (phoneData && phoneData.phone) {
            await db.sortedSetRemove('phone:uid', phoneData.phone);
        }
        await db.sortedSetRemove('users:phone', data.uid);

        // איפוס שדות המשתמש
        await User.setUserFields(data.uid, {
            [PHONE_FIELD_KEY]: '',
            phoneVerified: 0,
            phoneVerifiedAt: 0
        });
    };
    
    // Client APIs
    router.post('/api/phone-verification/send-code', middleware.applyCSRF, plugin.apiSendCode);
    router.post('/api/phone-verification/verify-code', middleware.applyCSRF, plugin.apiVerifyCode);
    router.post('/api/phone-verification/initiate-call', middleware.applyCSRF, plugin.apiInitiateCall);
    router.post('/api/phone-verification/check-status', middleware.applyCSRF, plugin.apiCheckStatus);
    
    // User Profile APIs
    router.get('/api/user/:userslug/phone', middleware.authenticateRequest, plugin.apiGetUserPhoneProfile);
    router.post('/api/user/:userslug/phone', middleware.authenticateRequest, middleware.applyCSRF, plugin.apiUpdateUserPhone);
    router.post('/api/user/:userslug/phone/visibility', middleware.authenticateRequest, middleware.applyCSRF, plugin.apiUpdatePhoneVisibility);
    router.post('/api/user/:userslug/phone/verify', middleware.authenticateRequest, middleware.applyCSRF, plugin.apiVerifyUserPhone);
    
    // Admin APIs
    router.get('/admin/plugins/phone-verification', middleware.admin.buildHeader, plugin.renderAdmin);
    router.get('/api/admin/plugins/phone-verification', plugin.renderAdmin);
    router.get('/api/admin/plugins/phone-verification/users', middleware.admin.checkPrivileges, plugin.apiAdminGetUsers);
    router.get('/api/admin/plugins/phone-verification/search', middleware.admin.checkPrivileges, plugin.apiAdminSearchByPhone);
    router.get('/api/admin/plugins/phone-verification/user/:uid', middleware.admin.checkPrivileges, plugin.apiAdminGetUserPhone);
    
    // Admin Settings APIs
    router.get('/api/admin/plugins/phone-verification/settings', middleware.admin.checkPrivileges, plugin.apiAdminGetSettings);
    router.post('/api/admin/plugins/phone-verification/settings', middleware.admin.checkPrivileges, middleware.applyCSRF, plugin.apiAdminSaveSettings);
    router.post('/api/admin/plugins/phone-verification/test-call', middleware.admin.checkPrivileges, middleware.applyCSRF, plugin.apiAdminTestCall);
};

// ==================== Settings & Admin ====================

plugin.getSettings = async function () {
    if (!meta) return defaultSettings;
    const settings = await meta.settings.get('phone-verification');
    return {
        voiceServerUrl: settings.voiceServerUrl || defaultSettings.voiceServerUrl,
        voiceServerApiKey: settings.voiceServerApiKey || defaultSettings.voiceServerApiKey,
        voiceServerEnabled: settings.voiceServerEnabled === 'true' || settings.voiceServerEnabled === true,
        blockUnverifiedUsers: settings.blockUnverifiedUsers === 'true' || settings.blockUnverifiedUsers === true,
        voiceTtsMode: settings.voiceTtsMode || defaultSettings.voiceTtsMode,
        voiceMessageTemplate: settings.voiceMessageTemplate || defaultSettings.voiceMessageTemplate
    };
};

plugin.saveSettings = async function (settings) {
    if (!meta) return false;
    await meta.settings.set('phone-verification', {
        voiceServerUrl: settings.voiceServerUrl || '',
        voiceServerApiKey: settings.voiceServerApiKey || '',
        voiceServerEnabled: settings.voiceServerEnabled ? 'true' : 'false',
        blockUnverifiedUsers: settings.blockUnverifiedUsers ? 'true' : 'false',
        voiceTtsMode: settings.voiceTtsMode || '1',
        voiceMessageTemplate: settings.voiceMessageTemplate || defaultSettings.voiceMessageTemplate
    });
    return true;
};

plugin.renderAdmin = function (req, res) {
    res.render('admin/plugins/phone-verification', {});
};

plugin.apiAdminGetSettings = async function (req, res) {
    try {
        const settings = await plugin.getSettings();
        res.json({ 
            success: true, 
            settings: {
                voiceServerUrl: settings.voiceServerUrl,
                voiceServerApiKey: settings.voiceServerApiKey ? '********' : '',
                voiceServerEnabled: settings.voiceServerEnabled,
                blockUnverifiedUsers: settings.blockUnverifiedUsers,
                voiceTtsMode: settings.voiceTtsMode,
                voiceMessageTemplate: settings.voiceMessageTemplate,
                hasApiKey: !!settings.voiceServerApiKey
            }
        });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiAdminSaveSettings = async function (req, res) {
    try {
        const { voiceServerUrl, voiceServerApiKey, voiceServerEnabled, blockUnverifiedUsers, voiceTtsMode, voiceMessageTemplate } = req.body;
        const currentSettings = await plugin.getSettings();
        const newApiKey = voiceServerApiKey === '********' ? currentSettings.voiceServerApiKey : voiceServerApiKey;
        await plugin.saveSettings({
            voiceServerUrl: voiceServerUrl || '',
            voiceServerApiKey: newApiKey || '',
            voiceServerEnabled: voiceServerEnabled === true || voiceServerEnabled === 'true',
            blockUnverifiedUsers: blockUnverifiedUsers === true || blockUnverifiedUsers === 'true',
            voiceTtsMode: voiceTtsMode,
            voiceMessageTemplate: voiceMessageTemplate
        });
        res.json({ success: true, message: 'ההגדרות נשמרו בהצלחה' });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiAdminTestCall = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.json({ success: false, error: 'PHONE_REQUIRED', message: 'חובה להזין מספר טלפון' });
        if (!plugin.validatePhoneNumber(phoneNumber)) return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        const testCode = '123456';
        const result = await plugin.sendVoiceCall(normalizedPhone, testCode);
        if (result.success) res.json({ success: true, message: 'שיחת בדיקה נשלחה בהצלחה!' });
        else res.json({ success: false, error: result.error, message: result.message });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};

// ==================== Public & User APIs ====================

plugin.apiSendCode = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        const callerUid = req.uid ? parseInt(req.uid, 10) : 0;
        
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const ipCheck = await plugin.checkIpRateLimit(clientIp);
        if (!ipCheck.allowed) return res.json(ipCheck);
        await plugin.incrementIpCounter(clientIp);
        
        if (!phoneNumber) return res.json({ success: false, error: 'PHONE_REQUIRED', message: 'חובה להזין מספר טלפון' });
        
        let cleanPhone = phoneNumber.replace(/\D/g, '');
        if (cleanPhone.startsWith('972')) cleanPhone = '0' + cleanPhone.substring(3);
        if (cleanPhone.length === 9 && cleanPhone.startsWith('5')) cleanPhone = '0' + cleanPhone;
        
        if (!/^05\d{8}$/.test(cleanPhone)) {
             return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        }
        
        const normalizedPhone = cleanPhone; 

        const existingUid = await plugin.findUserByPhone(normalizedPhone);
        
        // תיקון: אם המספר קיים אך שייך למשתמש הנוכחי - זה תקין
        if (existingUid) {
            if (callerUid !== 0 && existingUid === callerUid) {
                // המשתמש מנסה לאמת שוב את המספר של עצמו - זה בסדר
            } else {
                 return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום במערכת' });
            }
        }
        
        const code = plugin.generateVerificationCode();
        const saveResult = await plugin.saveVerificationCode(normalizedPhone, code);
        if (!saveResult.success) return res.json(saveResult);
        
        const voiceResult = await plugin.sendVoiceCall(normalizedPhone, code);
        const response = { 
            success: true, 
            message: voiceResult.success ? 'קוד אימות נשלח! תקבל שיחה בקרוב.' : 'קוד אימות נוצר בהצלחה',
            expiresAt: saveResult.expiresAt,
            voiceCallSent: voiceResult.success
        };
        if (process.env.NODE_ENV === 'development') {
            response._code = code;
            response._phone = normalizedPhone;
        }
        res.json(response);
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};

plugin.apiVerifyCode = async function (req, res) {
    try {
        const { phoneNumber, code } = req.body;
        if (!phoneNumber || !code) return res.json({ success: false, error: 'MISSING_PARAMS', message: 'חסרים פרמטרים' });
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        const result = await plugin.verifyCode(normalizedPhone, code);
        if (result.success) await plugin.markPhoneAsVerified(normalizedPhone);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};

plugin.apiCheckStatus = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.json({ success: false, verified: false });
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        const isVerified = await plugin.isPhoneVerified(normalizedPhone);
        res.json({ success: true, verified: isVerified });
    } catch (err) {
        res.json({ success: false, verified: false });
    }
};

plugin.apiInitiateCall = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.json({ success: false, error: 'PHONE_REQUIRED', message: 'חובה להזין מספר טלפון' });
        if (!plugin.validatePhoneNumber(phoneNumber)) return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        
        // תיקון: גם כאן לאפשר אם זה המשתמש עצמו, אך ב-API הזה אין לנו את ה-UID של המשתמש תמיד
        // בהנחה שזה API ציבורי, נשאיר את החסימה, או שנוסיף בדיקת UID אם קיים
        if (await plugin.isPhoneExists(normalizedPhone)) {
             // אם המשתמש מחובר, נבדוק אם זה שלו
             if (req.uid) {
                 const ownerUid = await plugin.findUserByPhone(normalizedPhone);
                 if (ownerUid && ownerUid !== parseInt(req.uid, 10)) {
                     return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום במערכת' });
                 }
             } else {
                 return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום במערכת' });
             }
        }

        const code = plugin.generateVerificationCode();
        const saveResult = await plugin.saveVerificationCode(normalizedPhone, code);
        if (!saveResult.success) return res.json(saveResult);
        res.json({ success: true, phone: normalizedPhone, code: code, expiresAt: saveResult.expiresAt });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};

plugin.apiGetUserPhoneProfile = async function (req, res) {
    try {
        const { userslug } = req.params;
        const callerUid = req.uid;
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) return res.json({ success: false, error: 'USER_NOT_FOUND' });
        
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        const isAdmin = await User.isAdministrator(callerUid);
        const showPhone = await db.getObjectField(`user:${uid}`, 'showPhone');
        const canView = isOwner || isAdmin || showPhone === '1' || showPhone === 1;
        
        if (!canView) return res.json({ success: true, phone: null, hidden: true });
        
        const phoneData = await plugin.getUserPhone(uid);
        res.json({
            success: true,
            phone: phoneData ? phoneData.phone : null,
            phoneVerified: phoneData ? phoneData.phoneVerified : false,
            showPhone: showPhone === '1' || showPhone === 1,
            isOwner: isOwner
        });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiUpdateUserPhone = async function (req, res) {
    try {
        const { userslug } = req.params;
        const { phoneNumber } = req.body;
        const callerUid = req.uid;
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) return res.json({ success: false, error: 'USER_NOT_FOUND' });
        
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        const isAdmin = await User.isAdministrator(callerUid);
        if (!isOwner && !isAdmin) return res.json({ success: false, error: 'UNAUTHORIZED', message: 'אין הרשאה לעדכן' });
        
        if (!phoneNumber || phoneNumber.trim() === '') {
            const existingPhone = await plugin.getUserPhone(uid);
            if (existingPhone && existingPhone.phone) {
                await db.sortedSetRemove('phone:uid', existingPhone.phone);
                await db.sortedSetRemove('users:phone', uid);
            }
            await User.setUserFields(uid, { [PHONE_FIELD_KEY]: '', phoneVerified: 0, phoneVerifiedAt: 0 });
            return res.json({ success: true, message: 'מספר הטלפון הוסר' });
        }
        
        if (!plugin.validatePhoneNumber(phoneNumber)) return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        const existingUid = await plugin.findUserByPhone(normalizedPhone);
        
        // תיקון: בדיקה שמאפשרת למשתמש לעדכן את המספר של עצמו
        if (existingUid && parseInt(existingUid, 10) !== parseInt(uid, 10)) {
            return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום למשתמש אחר' });
        }
        
        const result = await plugin.savePhoneToUser(uid, normalizedPhone, false);
        if (result.success) {
            res.json({ success: true, message: 'מספר הטלפון נשמר. יש לאמת אותו כדי להשלים את התהליך', needsVerification: true });
        } else {
            res.json(result);
        }
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiUpdatePhoneVisibility = async function (req, res) {
    try {
        const { userslug } = req.params;
        const { showPhone } = req.body;
        const callerUid = req.uid;
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) return res.json({ success: false, error: 'USER_NOT_FOUND' });
        
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        if (!isOwner) return res.json({ success: false, error: 'UNAUTHORIZED' });
        
        await db.setObjectField(`user:${uid}`, 'showPhone', showPhone ? '1' : '0');
        res.json({ success: true, showPhone: !!showPhone });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiVerifyUserPhone = async function (req, res) {
    try {
        const { userslug } = req.params;
        const { code } = req.body;
        const callerUid = req.uid;
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) return res.json({ success: false, error: 'USER_NOT_FOUND' });
        
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        if (!isOwner) return res.json({ success: false, error: 'UNAUTHORIZED' });
        
        const phoneData = await plugin.getUserPhone(uid);
        if (!phoneData || !phoneData.phone) return res.json({ success: false, error: 'NO_PHONE', message: 'לא נמצא מספר טלפון' });
        
        const result = await plugin.verifyCode(phoneData.phone, code);
        if (result.success) {
            await User.setUserFields(uid, { phoneVerified: 1, phoneVerifiedAt: Date.now() });
            // הוספה לרשימת המשתמשים עם טלפון (לצורך הצגה ב-Admin), למקרה שלא היה שם
            await db.sortedSetAdd('users:phone', Date.now(), uid);
            res.json({ success: true, message: 'מספר הטלפון אומת בהצלחה!' });
        } else {
            res.json(result);
        }
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiAdminGetUsers = async function (req, res) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const perPage = parseInt(req.query.perPage, 10) || 50;
        const start = (page - 1) * perPage;
        const stop = start + perPage - 1;
        const result = await plugin.getAllUsersWithPhones(start, stop);
        res.json({ 
            success: true, 
            users: result.users,
            total: result.total,
            page: page,
            perPage: perPage,
            totalPages: Math.ceil(result.total / perPage)
        });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiAdminSearchByPhone = async function (req, res) {
    try {
        const { phone } = req.query;
        if (!phone) return res.json({ success: false, error: 'MISSING_PHONE' });
        const normalizedPhone = plugin.normalizePhone(phone);
        const uid = await plugin.findUserByPhone(normalizedPhone);
        if (uid) {
            const userData = await plugin.getUserPhone(uid);
            const userInfo = await User.getUserFields(uid, ['username']);
            res.json({ success: true, found: true, user: { uid, username: userInfo.username, ...userData } });
        } else {
            res.json({ success: true, found: false });
        }
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.userDelete = async function (data) {
    const uid = data.uid;
    if (!uid) return;

    try {
        if (!db) db = require.main.require('./src/database');
        const phones = await db.getSortedSetRangeByScore('phone:uid', uid, 1, uid);
        
        if (phones && phones.length > 0) {
            const phone = phones[0]; 
            
            console.log(`[phone-verification] Deleting user ${uid}, releasing phone: ${phone}`);
            await db.sortedSetRemove('phone:uid', phone);
            await db.sortedSetRemove('users:phone', uid);
            await plugin.clearVerifiedPhone(phone);
        }
    } catch (err) {
        console.error('[phone-verification] Error releasing phone for user ' + uid, err);
    }
};

plugin.apiAdminGetUserPhone = async function (req, res) {
    try {
        const uid = parseInt(req.params.uid, 10);
        if (!uid) return res.json({ success: false, error: 'INVALID_UID' });
        const phoneData = await plugin.getUserPhone(uid);
        if (phoneData) res.json({ success: true, ...phoneData });
        else res.json({ success: true, phone: null });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

module.exports = plugin;