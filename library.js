'use strict';

const crypto = require('crypto');
const https = require('https'); // הוספנו עבור SSL

// NodeBB modules
let db;
let User;
let meta;
let SocketPlugins;

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

// ==================== בדיקת הרשאות ====================

plugin.checkPostingPermissions = async function (data) {
    const uid = data.uid || (data.post && data.post.uid) || (data.topic && data.topic.uid);
    if (!uid || parseInt(uid, 10) === 0) return data;

    const settings = await plugin.getSettings();
    if (!settings.blockUnverifiedUsers) return data;

    const isAdmin = await User.isAdministrator(uid);
    if (isAdmin) return data;

    const phoneData = await plugin.getUserPhone(uid);
    if (!phoneData || !phoneData.phoneVerified) {
        const userSlug = await User.getUserField(uid, 'userslug');
        const editUrl = userSlug ? `/user/${userSlug}/edit` : '/user/me/edit';
        throw new Error(`חובה לאמת מספר טלפון כדי להמשיך את הפעילות בפורום.<br/>אנא גש ל<a href="${editUrl}">הגדרות הפרופיל שלך</a>.`);
    }
    return data;
};

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
        throw new Error(`חובה לאמת מספר טלפון כדי להמשיך את הפעילות בפורום.<br/>אנא גש ל<a href="${editUrl}">הגדרות הפרופיל שלך</a>.`);
    }
    return data;
};

plugin.checkMessagingPermissions = async function (data) {
    const uid = data.fromUid;
    if (!uid || parseInt(uid, 10) === 0) return data;
    
    const settings = await plugin.getSettings();
    if (!settings.blockUnverifiedUsers) return data;

    const isAdmin = await User.isAdministrator(uid);
    if (isAdmin) return data;

    const phoneData = await plugin.getUserPhone(uid);
    if (phoneData && phoneData.phoneVerified) {
        return data;
    }    
    const Messaging = require.main.require('./src/messaging');
    const roomUids = await Messaging.getUidsInRoom(data.roomId, 0, -1);
    const targetUids = roomUids.filter(id => parseInt(id, 10) !== parseInt(uid, 10));
    if (targetUids.length === 0) {
        const userSlug = await User.getUserField(uid, 'userslug');
        const editUrl = userSlug ? `/user/${userSlug}/edit` : '/user/me/edit';
        throw new Error(`חובה לאמת מספר טלפון כדי להמשיך את הפעילות בפורום.<br/>אנא גש ל<a href="${editUrl}">הגדרות הפרופיל שלך</a>.`);
    }
    for (const targetUid of targetUids) {
        const isTargetAdmin = await User.isAdministrator(targetUid);
        if (!isTargetAdmin) {
        const userSlug = await User.getUserField(uid, 'userslug');
        const editUrl = userSlug ? `/user/${userSlug}/edit` : '/user/me/edit';
        throw new Error(`חובה לאמת מספר טלפון כדי להמשיך את הפעילות בפורום.<br/>אנא גש ל<a href="${editUrl}">הגדרות הפרופיל שלך</a>.`);
        }
    }
    return data;
};

// ==================== שליחת שיחה קולית ====================

plugin.sendVoiceCall = async function (phone, code) {
    const settings = await plugin.getSettings();
    if (!meta) meta = require.main.require('./src/meta');
    const siteTitle = meta.config.title || 'האתר';

    if (!settings.voiceServerEnabled || !settings.voiceServerApiKey) {
        return { success: false, error: 'VOICE_SERVER_DISABLED', message: 'שרת השיחות לא מוגדר' };
    }

    try {
        const spokenCode = plugin.formatCodeForSpeech(code);
        let messageText = settings.voiceMessageTemplate || defaultSettings.voiceMessageTemplate;
        messageText = messageText.replace(/{code}/g, spokenCode).replace(/{siteTitle}/g, siteTitle);

        const phonesData = {};
        phonesData[phone] = { name: 'משתמש', moreinfo: messageText, blocked: false };

        const baseUrl = settings.voiceServerUrl || defaultSettings.voiceServerUrl;
        const params = new URLSearchParams({
            ttsMode: settings.voiceTtsMode || defaultSettings.voiceTtsMode,
            phones: JSON.stringify(phonesData),
            token: settings.voiceServerApiKey
        });

        const url = `${baseUrl}?${params.toString()}`;
        
        // עקיפת בעיות SSL (אופציונלי)
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        const response = await fetch(url, { method: 'GET', agent: agent });

        if (!response.ok) return { success: false, error: 'VOICE_SERVER_ERROR', message: 'שגיאה בשרת השיחות' };
        const result = await response.json();
        
        if (result.responseStatus === 'OK' || result.responseStatus === 'WAITING') {
            return { success: true, result };
        } else {
            return { success: false, error: 'VOICE_SERVER_ERROR', message: result.message || 'שגיאה בשליחת השיחה' };
        }
    } catch (err) {
        console.error(err);
        return { success: false, error: 'VOICE_SERVER_ERROR', message: 'שגיאת תקשורת' };
    }
};

// ==================== ניהול נתונים (Redis) ====================

plugin.saveVerificationCode = async function (phone, code) {
    const normalizedPhone = plugin.normalizePhone(phone);
    const now = Date.now();
    const expiresAt = now + (CODE_EXPIRY_MINUTES * 60 * 1000);
    const key = `${REDIS_PREFIX}${normalizedPhone}`;
    
    if (!db) return { success: false, error: 'DB_ERROR' };
    
    const existing = await db.getObject(key);
    if (existing && existing.blockedUntil && parseInt(existing.blockedUntil, 10) > now) {
        return { success: false, error: 'PHONE_BLOCKED', message: 'המספר חסום זמנית' };
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
    
    if (!db) return { success: false, error: 'DB_ERROR' };
    const data = await db.getObject(key);
    
    if (!data) return { success: false, error: 'CODE_NOT_FOUND', message: 'לא נמצא קוד אימות' };
    if (data.blockedUntil && parseInt(data.blockedUntil, 10) > now) {
        return { success: false, error: 'PHONE_BLOCKED', message: 'המספר חסום זמנית' };
    }
    if (parseInt(data.expiresAt, 10) < now) return { success: false, error: 'CODE_EXPIRED', message: 'הקוד פג תוקף' };
    
    if (plugin.hashCode(code) === data.hashedCode) {
        await db.delete(key);
        return { success: true };
    }
    
    const attempts = parseInt(data.attempts, 10) + 1;
    if (attempts >= MAX_ATTEMPTS) {
        const blockedUntil = now + (BLOCK_DURATION_MINUTES * 60 * 1000);
        await db.setObjectField(key, 'blockedUntil', blockedUntil);
        await db.setObjectField(key, 'attempts', attempts);
        return { success: false, error: 'PHONE_BLOCKED', message: 'יותר מדי ניסיונות שגויים' };
    }
    await db.setObjectField(key, 'attempts', attempts);
    return { success: false, error: 'CODE_INVALID', message: 'קוד שגוי' };
};

plugin.checkIpRateLimit = async function (ip) {
    if (!db || !ip) return { allowed: true };
    const key = `${IP_RATE_LIMIT_PREFIX}${ip}`;
    const count = await db.get(key);
    if (count && parseInt(count, 10) >= MAX_REQUESTS_PER_IP) {
        return { allowed: false, error: 'IP_BLOCKED', message: 'חסימת IP זמנית' };
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
    return !!verifiedAt;
};

plugin.clearVerifiedPhone = async function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    if (db) await db.delete(`phone-verification:verified:${normalizedPhone}`);
};

// ==================== DB Users Logic ====================
plugin.savePhoneToUser = async function (uid, phone, verified = true, forceOverride = false) {
    if (!db || !User) return { success: false };
    
    // 1. מקרה של אימות ללא טלפון
    if (!phone) {
        await User.setUserFields(uid, {
            phoneVerified: verified ? 1 : 0,
            phoneVerifiedAt: verified ? Date.now() : 0
        });
        const oldPhoneData = await plugin.getUserPhone(uid);
        if (oldPhoneData && oldPhoneData.phone) {
            await db.sortedSetRemove('phone:uid', oldPhoneData.phone);
        }
        await db.sortedSetAdd('users:phone', Date.now(), uid);
        return { success: true };
    }

    const normalizedPhone = plugin.normalizePhone(phone);
    const existingUid = await db.sortedSetScore('phone:uid', normalizedPhone);
    
    // 2. בדיקת כפילות
    if (existingUid) {
        // אם המספר שייך למשתמש אחר
        if (parseInt(existingUid, 10) !== parseInt(uid, 10)) {
            if (forceOverride) {
                // === תיקון: דריסה בכוח (למנהלים) ===
                // מחיקת המספר מהמשתמש הישן
                console.log(`[phone-verification] Force overwriting phone ${normalizedPhone} from user ${existingUid} to ${uid}`);
                
                // הסרה מה-Set של המשתמש הישן
                await User.setUserFields(existingUid, { 
                    [PHONE_FIELD_KEY]: '', 
                    phoneVerified: 0, 
                    phoneVerifiedAt: 0 
                });
                await db.sortedSetRemove('users:phone', existingUid);
                // (הערה: לא צריך להסיר מ-phone:uid כי אנחנו דורסים אותו מייד למטה)
            } else {
                // אם זה לא מנהל - זרוק שגיאה
                return { success: false, error: 'PHONE_EXISTS', message: 'המספר כבר רשום למשתמש אחר' };
            }
        }
    }

    const now = Date.now();
    await User.setUserFields(uid, {
        [PHONE_FIELD_KEY]: normalizedPhone,
        phoneVerified: verified ? 1 : 0,
        phoneVerifiedAt: verified ? now : 0
    });
    
    // עדכון/דריסה של הרשומה ב-DB
    await db.sortedSetAdd('phone:uid', uid, normalizedPhone);
    await db.sortedSetAdd('users:phone', now, uid);
    return { success: true };
};

plugin.getUserPhone = async function (uid) {
    if (!User) return null;
    const userData = await User.getUserFields(uid, [PHONE_FIELD_KEY, 'phoneVerified', 'phoneVerifiedAt']);
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

plugin.checkRegistration = async function (data) {
    try {
        const phoneNumber = data.req.body.phoneNumber;
        const req = data.req;
        const res = data.res;

        if (!phoneNumber) {
            throw new Error('חובה להזין מספר טלפון');
        }
        
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        const existingUid = await plugin.findUserByPhone(normalizedPhone);
        
        if (existingUid) {
            // אם המשתמש מחובר ומנסה לעדכן, או אם המספר תפוס על ידי מישהו אחר
            if (!req.uid || parseInt(existingUid, 10) !== parseInt(req.uid, 10)) {
                throw new Error('מספר הטלפון כבר רשום במערכת למשתמש אחר');
            }
        }

        // אם הגעת לכאן, הנתונים תקינים. 
        // ב-Hook של checkRegistration, פשוט מחזירים את data כדי להמשיך ברישום.
        return data;
        
    } catch (err) {
        console.error('[phone-verification] Registration check error:', err);
        throw err; // NodeBB יציג את השגיאה הזו למשתמש בטופס הרישום
    }
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

// ==================== MAIN INIT ====================

plugin.init = async function (params) {
    const { router, middleware } = params;
    db = require.main.require('./src/database');
    User = require.main.require('./src/user');
    meta = require.main.require('./src/meta');
    SocketPlugins = require.main.require('./src/socket.io/plugins');
    
    // --- SOCKET.IO EVENTS ---
    SocketPlugins.call2all = {};

    // 1. פונקציה חדשה: מציאת משתמש לפי שם
    SocketPlugins.call2all.getUidByUsername = async function (socket, data) {
        if (!data || !data.username) throw new Error('נא לספק שם משתמש');
        const uid = await User.getUidByUsername(data.username);
        if (!uid) throw new Error('משתמש לא נמצא');
        return uid;
    };

    // 2. הוספת משתמש מאומת (מתוקן)
    SocketPlugins.call2all.adminAddVerifiedUser = async function (socket, data) {
        if (!data || !data.uid) throw new Error('חסר מזהה משתמש');
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');

        let phone = null;
        if (data.phone && data.phone.trim().length > 0) {
            phone = data.phone;
            if (!plugin.validatePhoneNumber(phone)) throw new Error('מספר לא תקין');
        }

        const result = await plugin.savePhoneToUser(data.uid, phone, true, true);
        
        if (!result.success) throw new Error(result.message);
    };

    // 3. אימות ידני
    SocketPlugins.call2all.adminVerifyUser = async function (socket, data) {
        if (!data || !data.uid) throw new Error('שגיאה');
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');
        
        await User.setUserFields(data.uid, { phoneVerified: 1, phoneVerifiedAt: Date.now() });
        await db.sortedSetAdd('users:phone', Date.now(), data.uid);
    };

    // 4. ביטול אימות
    SocketPlugins.call2all.adminUnverifyUser = async function (socket, data) {
        if (!data || !data.uid) throw new Error('שגיאה');
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');
        
        await User.setUserFields(data.uid, { phoneVerified: 0, phoneVerifiedAt: 0 });
    };

    // 5. מחיקת טלפון
    SocketPlugins.call2all.adminDeleteUserPhone = async function (socket, data) {
        if (!data || !data.uid) throw new Error('שגיאה');
        const isAdmin = await User.isAdministrator(socket.uid);
        if (!isAdmin) throw new Error('אין הרשאה');
        
        const phoneData = await plugin.getUserPhone(data.uid);
        if (phoneData && phoneData.phone) {
            await db.sortedSetRemove('phone:uid', phoneData.phone);
        }
        await db.sortedSetRemove('users:phone', data.uid);
        await User.setUserFields(data.uid, { [PHONE_FIELD_KEY]: '', phoneVerified: 0, phoneVerifiedAt: 0 });
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
    router.get('/api/admin/plugins/phone-verification/settings', middleware.admin.checkPrivileges, plugin.apiAdminGetSettings);
    router.post('/api/admin/plugins/phone-verification/settings', middleware.admin.checkPrivileges, middleware.applyCSRF, plugin.apiAdminSaveSettings);
    router.post('/api/admin/plugins/phone-verification/test-call', middleware.admin.checkPrivileges, middleware.applyCSRF, plugin.apiAdminTestCall);
};
plugin.apiCheckStatus = async function (req, res) {
    try {
        const v = await plugin.isPhoneVerified(plugin.normalizePhone(req.body.phoneNumber));
        res.json({ success: true, verified: v });
    } catch (e) { res.json({ success: false }); }
};
plugin.getSettings = async function () {
    if (!meta) meta = require.main.require('./src/meta');
    const settings = await meta.settings.get('phone-verification');
    
    const isTrue = (val) => val === true || val === 'true' || val === 'on' || val === '1';

    return {
        voiceServerUrl: settings.voiceServerUrl || defaultSettings.voiceServerUrl,
        voiceServerApiKey: settings.voiceServerApiKey || '',
        voiceServerEnabled: isTrue(settings.voiceServerEnabled), // בדיקה מורחבת
        blockUnverifiedUsers: isTrue(settings.blockUnverifiedUsers), // בדיקה מורחבת
        voiceTtsMode: settings.voiceTtsMode || '1',
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

plugin.renderAdmin = function (req, res) { res.render('admin/plugins/phone-verification', {}); };

plugin.apiAdminGetSettings = async function (req, res) {
    try {
        const settings = await plugin.getSettings();
        res.json({ success: true, settings: { ...settings, voiceServerApiKey: settings.voiceServerApiKey ? '********' : '' } });
    } catch (err) { res.json({ success: false }); }
};

plugin.apiAdminSaveSettings = async function (req, res) {
    try {
        const { voiceServerApiKey, ...rest } = req.body;
        const current = await plugin.getSettings();
        const apiKey = voiceServerApiKey === '********' ? current.voiceServerApiKey : voiceServerApiKey;
        await plugin.saveSettings({ ...rest, voiceServerApiKey: apiKey });
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
};

plugin.apiAdminTestCall = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.json({ success: false, message: 'חסר טלפון' });
        const result = await plugin.sendVoiceCall(plugin.normalizePhone(phoneNumber), '123456');
        res.json(result);
    } catch (err) { res.json({ success: false }); }
};

plugin.apiSendCode = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.json({ success: false, error: 'MISSING' });
        
        const clientIp = req.ip || req.headers['x-forwarded-for'];
        const ipCheck = await plugin.checkIpRateLimit(clientIp);
        if (!ipCheck.allowed) return res.json(ipCheck);
        await plugin.incrementIpCounter(clientIp);
        
        const clean = plugin.normalizePhone(phoneNumber.replace(/\D/g, ''));
        if (!plugin.validatePhoneNumber(clean)) return res.json({ success: false, error: 'INVALID' });

        const existingUid = await plugin.findUserByPhone(clean);
        // בדיקת כפילות: אם המספר שייך למשתמש אחר
        if (existingUid && (!req.uid || parseInt(existingUid) !== parseInt(req.uid))) {
            return res.json({ success: false, error: 'EXISTS', message: 'המספר תפוס' });
        }
        
        const code = plugin.generateVerificationCode();
        await plugin.saveVerificationCode(clean, code);
        const result = await plugin.sendVoiceCall(clean, code);
        
        res.json({ success: true, message: result.success ? 'שיחה נשלחה' : 'קוד נוצר', voiceCallSent: result.success });
    } catch (err) { res.json({ success: false }); }
};

plugin.apiVerifyCode = async function (req, res) {
    try {
        const { phoneNumber, code } = req.body;
        const result = await plugin.verifyCode(plugin.normalizePhone(phoneNumber), code);
        if (result.success) await plugin.markPhoneAsVerified(plugin.normalizePhone(phoneNumber));
        res.json(result);
    } catch (err) { res.json({ success: false }); }
};

plugin.apiInitiateCall = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.json({ success: false, error: 'PHONE_REQUIRED', message: 'חובה להזין מספר טלפון' });
        }
        
        if (!plugin.validatePhoneNumber(phoneNumber)) {
            return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        }
        
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        
        const existingUid = await plugin.findUserByPhone(normalizedPhone);
        
        if (existingUid) {
            if (!req.uid || parseInt(existingUid, 10) !== parseInt(req.uid, 10)) {
                return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום במערכת' });
            }
        }
        
        const code = plugin.generateVerificationCode();
        const saveResult = await plugin.saveVerificationCode(normalizedPhone, code);
        
        if (!saveResult.success) {
            return res.json(saveResult);
        }
        
        res.json({ success: true, phone: normalizedPhone, code: code, expiresAt: saveResult.expiresAt });
        
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};
plugin.apiGetUserPhoneProfile = async function (req, res) {
    try {
        const uid = await User.getUidByUserslug(req.params.userslug);
        const isOwner = parseInt(uid) === parseInt(req.uid);
        const isAdmin = await User.isAdministrator(req.uid);
        if (!isOwner && !isAdmin) return res.json({ success: true, phone: null, hidden: true });
        const data = await plugin.getUserPhone(uid);
        res.json({ success: true, phone: data ? data.phone : null, phoneVerified: data ? data.phoneVerified : false, isOwner });
    } catch (e) { res.json({ success: false }); }
};

plugin.apiUpdateUserPhone = async function (req, res) {
    try {
        const uid = await User.getUidByUserslug(req.params.userslug);
        const isOwner = parseInt(uid) === parseInt(req.uid);
        const isAdmin = await User.isAdministrator(req.uid);
        if (!isOwner && !isAdmin) return res.json({ success: false, error: '403' });
        
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
             const old = await plugin.getUserPhone(uid);
             if (old && old.phone) {
                 await db.sortedSetRemove('phone:uid', old.phone);
                 await db.sortedSetRemove('users:phone', uid);
             }
             await User.setUserFields(uid, { [PHONE_FIELD_KEY]: '', phoneVerified: 0 });
             return res.json({ success: true });
        }
        
        const clean = plugin.normalizePhone(phoneNumber);
        if (!plugin.validatePhoneNumber(clean)) return res.json({ success: false, error: 'INVALID' });
        
        const existing = await plugin.findUserByPhone(clean);
        if (existing && parseInt(existing) !== parseInt(uid)) return res.json({ success: false, error: 'EXISTS' });
        
        await plugin.savePhoneToUser(uid, clean, false);
        res.json({ success: true, needsVerification: true });
    } catch (e) { res.json({ success: false }); }
};

plugin.apiUpdatePhoneVisibility = async function(req,res) {
    try {
        const uid = await User.getUidByUserslug(req.params.userslug);
        if (parseInt(uid) !== parseInt(req.uid)) return res.json({success:false});
        await db.setObjectField(`user:${uid}`, 'showPhone', req.body.showPhone ? '1' : '0');
        res.json({success:true});
    } catch(e){ res.json({success:false}); }
};

plugin.apiVerifyUserPhone = async function(req,res) {
    try {
        const uid = await User.getUidByUserslug(req.params.userslug);
        if (parseInt(uid) !== parseInt(req.uid)) return res.json({success:false});
        const data = await plugin.getUserPhone(uid);
        if (!data || !data.phone) return res.json({success:false});
        const result = await plugin.verifyCode(data.phone, req.body.code);
        if (result.success) {
            await User.setUserFields(uid, { phoneVerified: 1, phoneVerifiedAt: Date.now() });
            await db.sortedSetAdd('users:phone', Date.now(), uid);
        }
        res.json(result);
    } catch(e){ res.json({success:false}); }
};

plugin.apiAdminGetUsers = async function (req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const result = await plugin.getAllUsersWithPhones((page - 1) * 50, (page * 50) - 1);
        res.json({ success: true, users: result.users, total: result.total, page, totalPages: Math.ceil(result.total / 50) });
    } catch (e) { res.json({ success: false }); }
};

plugin.apiAdminSearchByPhone = async function (req, res) {
    try {
        const uid = await plugin.findUserByPhone(req.query.phone);
        if (uid) {
            const data = await plugin.getUserPhone(uid);
            const u = await User.getUserFields(uid, ['username']);
            res.json({ success: true, found: true, user: { uid, username: u.username, ...data } });
        } else res.json({ success: true, found: false });
    } catch (e) { res.json({ success: false }); }
};

plugin.apiAdminGetUserPhone = async function (req, res) {
    const data = await plugin.getUserPhone(req.params.uid);
    res.json({ success: true, ...data });
};

plugin.userDelete = async function (data) {
    try {
        const phones = await db.getSortedSetRangeByScore('phone:uid', data.uid, 1, data.uid);
        if (phones[0]) {
            await db.sortedSetRemove('phone:uid', phones[0]);
            await db.sortedSetRemove('users:phone', data.uid);
        }
    } catch (e) {}
};

module.exports = plugin;
