'use strict';

const crypto = require('crypto');

// NodeBB modules - יטענו בזמן ריצה
let db;
let User;
let meta;

const plugin = {};

// ==================== אחסון קודי אימות (In-Memory) ====================
const verificationCodes = new Map();

// קבועים
const CODE_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const BLOCK_DURATION_MINUTES = 15;
const PHONE_FIELD_KEY = 'phoneNumber';

// ==================== הגדרות ברירת מחדל ====================
const defaultSettings = {
    voiceServerUrl: '',
    voiceServerApiKey: '',
    voiceServerEnabled: false
};

// ==================== פונקציות עזר ====================

plugin.validatePhoneNumber = function (phone) {
    if (!phone || typeof phone !== 'string') {
        return false;
    }
    const phoneRegex = /^05\d[-]?\d{7}$/;
    return phoneRegex.test(phone);
};

plugin.normalizePhone = function (phone) {
    if (!phone || typeof phone !== 'string') {
        return '';
    }
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

// ==================== קודי אימות ====================

plugin.saveVerificationCode = function (phone, code) {
    const normalizedPhone = plugin.normalizePhone(phone);
    const now = Date.now();
    const expiresAt = now + (CODE_EXPIRY_MINUTES * 60 * 1000);
    
    const existing = verificationCodes.get(normalizedPhone);
    if (existing && existing.blockedUntil && existing.blockedUntil > now) {
        const remainingMinutes = Math.ceil((existing.blockedUntil - now) / 60000);
        return { 
            success: false, 
            error: 'PHONE_BLOCKED',
            message: `המספר חסום זמנית, נסה שוב בעוד ${remainingMinutes} דקות`
        };
    }
    
    verificationCodes.set(normalizedPhone, {
        hashedCode: plugin.hashCode(code),
        attempts: 0,
        createdAt: now,
        expiresAt: expiresAt,
        blockedUntil: null
    });
    
    return { success: true, expiresAt };
};

plugin.getCodeExpiry = function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    const data = verificationCodes.get(normalizedPhone);
    return data ? data.expiresAt : null;
};

plugin.verifyCode = function (phone, code) {
    const normalizedPhone = plugin.normalizePhone(phone);
    const now = Date.now();
    const data = verificationCodes.get(normalizedPhone);
    
    if (!data) {
        return { success: false, error: 'CODE_NOT_FOUND', message: 'לא נמצא קוד אימות למספר זה' };
    }
    
    if (data.blockedUntil && data.blockedUntil > now) {
        const remainingMinutes = Math.ceil((data.blockedUntil - now) / 60000);
        return { 
            success: false, 
            error: 'PHONE_BLOCKED',
            message: `המספר חסום זמנית, נסה שוב בעוד ${remainingMinutes} דקות`
        };
    }
    
    if (data.expiresAt < now) {
        return { success: false, error: 'CODE_EXPIRED', message: 'קוד האימות פג תוקף' };
    }
    
    const hashedInput = plugin.hashCode(code);
    if (hashedInput === data.hashedCode) {
        verificationCodes.delete(normalizedPhone);
        return { success: true };
    }
    
    data.attempts += 1;
    
    if (data.attempts >= MAX_ATTEMPTS) {
        data.blockedUntil = now + (BLOCK_DURATION_MINUTES * 60 * 1000);
        return { 
            success: false, 
            error: 'PHONE_BLOCKED',
            message: `המספר נחסם ל-${BLOCK_DURATION_MINUTES} דקות עקב ניסיונות כושלים`
        };
    }
    
    return { 
        success: false, 
        error: 'CODE_INVALID',
        message: `קוד האימות שגוי. נותרו ${MAX_ATTEMPTS - data.attempts} ניסיונות`
    };
};

plugin.clearVerificationCode = function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    verificationCodes.delete(normalizedPhone);
};

plugin.clearAllCodes = function () {
    verificationCodes.clear();
};

// ==================== טלפונים מאומתים זמנית ====================
const verifiedPhones = new Map();

plugin.markPhoneAsVerified = function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    verifiedPhones.set(normalizedPhone, {
        verified: true,
        verifiedAt: Date.now()
    });
};

plugin.isPhoneVerified = function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    const data = verifiedPhones.get(normalizedPhone);
    if (!data) return false;
    
    const tenMinutes = 10 * 60 * 1000;
    if (Date.now() - data.verifiedAt > tenMinutes) {
        verifiedPhones.delete(normalizedPhone);
        return false;
    }
    return true;
};

plugin.clearVerifiedPhone = function (phone) {
    const normalizedPhone = plugin.normalizePhone(phone);
    verifiedPhones.delete(normalizedPhone);
};


// ==================== פונקציות DB - שמירה ושליפה מ-NodeBB ====================

/**
 * בדיקה אם מספר טלפון כבר קיים במערכת
 */
plugin.isPhoneExists = async function (phone) {
    if (!db) return false;
    const normalizedPhone = plugin.normalizePhone(phone);
    const uid = await db.sortedSetScore('phone:uid', normalizedPhone);
    return !!uid;
};

/**
 * שמירת מספר טלפון למשתמש ב-DB של NodeBB
 */
plugin.savePhoneToUser = async function (uid, phone, verified = true) {
    if (!db || !User) return { success: false };
    
    const normalizedPhone = plugin.normalizePhone(phone);
    
    // בדיקה אם המספר כבר קיים למשתמש אחר
    const existingUid = await db.sortedSetScore('phone:uid', normalizedPhone);
    if (existingUid && parseInt(existingUid, 10) !== parseInt(uid, 10)) {
        return {
            success: false,
            error: 'PHONE_EXISTS',
            message: 'מספר הטלפון כבר רשום במערכת'
        };
    }
    
    const now = Date.now();
    
    // שמירה בשדות המשתמש
    await User.setUserFields(uid, {
        [PHONE_FIELD_KEY]: normalizedPhone,
        phoneVerified: verified ? 1 : 0,
        phoneVerifiedAt: verified ? now : 0
    });
    
    // שמירה באינדקס לחיפוש
    await db.sortedSetAdd('phone:uid', uid, normalizedPhone);
    await db.sortedSetAdd('users:phone', now, uid);
    
    return { success: true };
};

/**
 * קבלת מספר טלפון של משתמש
 */
plugin.getUserPhone = async function (uid) {
    if (!User) return null;
    
    const userData = await User.getUserFields(uid, [PHONE_FIELD_KEY, 'phoneVerified', 'phoneVerifiedAt']);
    if (!userData || !userData[PHONE_FIELD_KEY]) {
        return null;
    }
    
    return {
        phone: userData[PHONE_FIELD_KEY],
        phoneVerified: parseInt(userData.phoneVerified, 10) === 1,
        phoneVerifiedAt: parseInt(userData.phoneVerifiedAt, 10) || null
    };
};

/**
 * חיפוש משתמש לפי מספר טלפון
 */
plugin.findUserByPhone = async function (phone) {
    if (!db) return null;
    const normalizedPhone = plugin.normalizePhone(phone);
    const uid = await db.sortedSetScore('phone:uid', normalizedPhone);
    return uid ? parseInt(uid, 10) : null;
};

/**
 * קבלת כל המשתמשים עם מספרי טלפון
 */
plugin.getAllUsersWithPhones = async function () {
    if (!db || !User) return [];
    
    const uids = await db.getSortedSetRange('users:phone', 0, -1);
    if (!uids || !uids.length) return [];
    
    const users = await User.getUsersFields(uids, ['uid', 'username', PHONE_FIELD_KEY, 'phoneVerified', 'phoneVerifiedAt']);
    
    return users.filter(u => u && u[PHONE_FIELD_KEY]).map(u => ({
        uid: u.uid,
        username: u.username,
        phone: u[PHONE_FIELD_KEY],
        phoneVerified: parseInt(u.phoneVerified, 10) === 1,
        phoneVerifiedAt: parseInt(u.phoneVerifiedAt, 10) || null
    }));
};

plugin.canViewPhone = function (uid, callerUid, isAdmin) {
    if (isAdmin) return true;
    return parseInt(uid, 10) === parseInt(callerUid, 10);
};

// לבדיקות
plugin.clearAllPhones = function () {};


// ==================== Hooks ====================

/**
 * Hook: filter:register.check
 */
plugin.checkRegistration = async function (data) {
    const phoneNumber = data.req.body.phoneNumber;
    
    if (!phoneNumber) {
        throw new Error('חובה להזין מספר טלפון');
    }
    
    if (!plugin.validatePhoneNumber(phoneNumber)) {
        throw new Error('מספר הטלפון אינו תקין');
    }
    
    const normalizedPhone = plugin.normalizePhone(phoneNumber);
    
    if (await plugin.isPhoneExists(normalizedPhone)) {
        throw new Error('מספר הטלפון כבר רשום במערכת');
    }
    
    if (!plugin.isPhoneVerified(normalizedPhone)) {
        throw new Error('יש לאמת את מספר הטלפון לפני ההרשמה');
    }
    
    data.userData.phoneNumber = normalizedPhone;
    
    return data;
};

/**
 * Hook: action:user.create
 */
plugin.userCreated = async function (data) {
    const { user } = data;
    const phoneNumber = data.data.phoneNumber;
    
    if (phoneNumber && user && user.uid) {
        await plugin.savePhoneToUser(user.uid, phoneNumber, true);
        plugin.clearVerifiedPhone(phoneNumber);
    }
};

/**
 * Hook: filter:admin.header.build
 * הוספת קישור לעמוד ההגדרות בתפריט Settings
 */
plugin.addAdminNavigation = async function (header) {
    if (header.plugins) {
        header.plugins.push({
            route: '/plugins/phone-verification',
            icon: 'fa-phone',
            name: 'אימות טלפון'
        });
    }
    return header;
};

/**
 * Hook: filter:user.whitelistFields
 * הוספת שדה הטלפון לרשימת השדות המותרים
 */
plugin.whitelistFields = async function (data) {
    data.whitelist.push(PHONE_FIELD_KEY, 'phoneVerified', 'phoneVerifiedAt', 'showPhone');
    return data;
};

/**
 * Hook: filter:user.getFields
 * הוספת מידע הטלפון לנתוני המשתמש
 */
plugin.addPhoneToUserData = async function (data) {
    return data;
};

/**
 * Hook: filter:user.account
 * הוספת שדה טלפון לעמוד הגדרות החשבון
 */
plugin.addPhoneToAccount = async function (data) {
    if (data.userData && data.userData.uid) {
        const phoneData = await plugin.getUserPhone(data.userData.uid);
        if (phoneData) {
            data.userData.phoneNumber = phoneData.phone;
            data.userData.phoneVerified = phoneData.phoneVerified;
        }
        // קבלת הגדרת הצגת הטלפון
        const showPhone = await db.getObjectField(`user:${data.userData.uid}`, 'showPhone');
        data.userData.showPhone = showPhone === '1' || showPhone === 1;
    }
    return data;
};

/**
 * Hook: filter:user.profileMenu
 * הוספת לינק לטלפון בתפריט הפרופיל (אופציונלי)
 */
plugin.addPhoneToProfileMenu = async function (data) {
    return data;
};

/**
 * Hook: filter:user.customFields
 * הוספת שדה טלפון לשדות המותאמים אישית
 */
plugin.addCustomFields = async function (data) {
    data.fields.push({
        name: 'phoneNumber',
        label: 'מספר טלפון',
        type: 'text'
    });
    return data;
};

/**
 * Hook: filter:script.load
 * טעינת סקריפט צד-לקוח בעמוד ההרשמה
 */
plugin.loadScript = async function (data) {
    // טעינה בכל עמוד הרשמה
    if (data.tpl_url === 'register' || data.tpl === 'register') {
        if (!data.scripts.includes('forum/phone-verification')) {
            data.scripts.push('forum/phone-verification');
        }
    }
    return data;
};

/**
 * Hook: static:app.load
 */
plugin.init = async function (params) {
    const { router, middleware } = params;
    
    // טעינת מודולי NodeBB
    db = require.main.require('./src/database');
    User = require.main.require('./src/user');
    meta = require.main.require('./src/meta');
    
    // API routes - עם middleware לבדיקת CSRF
    router.post('/api/phone-verification/send-code', middleware.applyCSRF, plugin.apiSendCode);
    router.post('/api/phone-verification/verify-code', middleware.applyCSRF, plugin.apiVerifyCode);
    router.post('/api/phone-verification/initiate-call', middleware.applyCSRF, plugin.apiInitiateCall);
    
    // User profile phone routes
    router.get('/api/user/:userslug/phone', middleware.authenticateRequest, plugin.apiGetUserPhoneProfile);
    router.post('/api/user/:userslug/phone', middleware.authenticateRequest, middleware.applyCSRF, plugin.apiUpdateUserPhone);
    router.post('/api/user/:userslug/phone/visibility', middleware.authenticateRequest, middleware.applyCSRF, plugin.apiUpdatePhoneVisibility);
    router.post('/api/user/:userslug/phone/verify', middleware.authenticateRequest, middleware.applyCSRF, plugin.apiVerifyUserPhone);
    
    // Admin routes
    router.get('/admin/plugins/phone-verification', middleware.admin.buildHeader, plugin.renderAdmin);
    router.get('/api/admin/plugins/phone-verification', plugin.renderAdmin);
    router.get('/api/admin/plugins/phone-verification/users', middleware.admin.checkPrivileges, plugin.apiAdminGetUsers);
    router.get('/api/admin/plugins/phone-verification/search', middleware.admin.checkPrivileges, plugin.apiAdminSearchByPhone);
    router.get('/api/admin/plugins/phone-verification/user/:uid', middleware.admin.checkPrivileges, plugin.apiAdminGetUserPhone);
    
    // Admin settings routes
    router.get('/api/admin/plugins/phone-verification/settings', middleware.admin.checkPrivileges, plugin.apiAdminGetSettings);
    router.post('/api/admin/plugins/phone-verification/settings', middleware.admin.checkPrivileges, middleware.applyCSRF, plugin.apiAdminSaveSettings);
    router.post('/api/admin/plugins/phone-verification/test-call', middleware.admin.checkPrivileges, middleware.applyCSRF, plugin.apiAdminTestCall);
};

// ==================== הגדרות ====================

/**
 * קבלת הגדרות התוסף
 */
plugin.getSettings = async function () {
    if (!meta) return defaultSettings;
    
    const settings = await meta.settings.get('phone-verification');
    return {
        voiceServerUrl: settings.voiceServerUrl || defaultSettings.voiceServerUrl,
        voiceServerApiKey: settings.voiceServerApiKey || defaultSettings.voiceServerApiKey,
        voiceServerEnabled: settings.voiceServerEnabled === 'true' || settings.voiceServerEnabled === true
    };
};

/**
 * שמירת הגדרות התוסף
 */
plugin.saveSettings = async function (settings) {
    if (!meta) return false;
    
    await meta.settings.set('phone-verification', {
        voiceServerUrl: settings.voiceServerUrl || '',
        voiceServerApiKey: settings.voiceServerApiKey || '',
        voiceServerEnabled: settings.voiceServerEnabled ? 'true' : 'false'
    });
    return true;
};

/**
 * פורמט קוד לקריאה קולית (רווחים בין הספרות)
 */
plugin.formatCodeForSpeech = function (code) {
    return code.split('').join(' ');
};

/**
 * שליחת שיחה קולית דרך Call2All API
 */
plugin.sendVoiceCall = async function (phone, code) {
    const settings = await plugin.getSettings();
    
    if (!settings.voiceServerEnabled || !settings.voiceServerApiKey) {
        return { success: false, error: 'VOICE_SERVER_DISABLED', message: 'שרת השיחות הקוליות לא מוגדר' };
    }
    
    try {
        // פורמט הקוד עם פסיקים לקריאה ברורה
        const spokenCode = plugin.formatCodeForSpeech(code);
        
        // בניית אובייקט הטלפונים לפי פורמט Call2All
        const phonesData = {};
        phonesData[phone] = {
            name: 'משתמש',
            moreinfo: `הקוד שלך לאתר הפורום הוא ${spokenCode}. אני חוזר, הקוד הוא ${spokenCode}`,
            blocked: false
        };
        
        // בניית ה-URL עם הפרמטרים
        const baseUrl = 'https://www.call2all.co.il/ym/api/RunCampaign';
        const params = new URLSearchParams({
            ttsMode: '1',
            phones: JSON.stringify(phonesData),
            token: settings.voiceServerApiKey
        });
        
        const url = `${baseUrl}?${params.toString()}`;
        
        console.log('[phone-verification] Calling Call2All API for phone:', phone);
        
        const response = await fetch(url, {
            method: 'GET'
        });
        
        if (!response.ok) {
            console.error('[phone-verification] Call2All API error:', response.status, response.statusText);
            return { success: false, error: 'VOICE_SERVER_ERROR', message: 'שגיאה בשרת השיחות הקוליות' };
        }
        
        const result = await response.json();
        console.log('[phone-verification] Call2All response:', result);
        
        // בדיקת תגובת Call2All
        if (result.responseStatus === 'OK' || result.responseStatus === 'WAITING') {
            return { success: true, result };
        } else {
            return { success: false, error: 'VOICE_SERVER_ERROR', message: result.message || 'שגיאה בשליחת השיחה' };
        }
        
    } catch (err) {
        console.error('[phone-verification] Voice call error:', err);
        return { success: false, error: 'VOICE_SERVER_ERROR', message: 'שגיאה בהתחברות לשרת השיחות הקוליות' };
    }
};


// ==================== API Endpoints ====================

plugin.apiSendCode = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.json({ success: false, error: 'PHONE_REQUIRED', message: 'חובה להזין מספר טלפון' });
        }
        
        if (!plugin.validatePhoneNumber(phoneNumber)) {
            return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        }
        
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        
        if (await plugin.isPhoneExists(normalizedPhone)) {
            return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום במערכת' });
        }
        
        const code = plugin.generateVerificationCode();
        const saveResult = plugin.saveVerificationCode(normalizedPhone, code);
        
        if (!saveResult.success) {
            return res.json(saveResult);
        }
        
        // שליחת שיחה קולית
        const voiceResult = await plugin.sendVoiceCall(normalizedPhone, code);
        
        const response = { 
            success: true, 
            message: voiceResult.success ? 'קוד אימות נשלח! תקבל שיחה בקרוב.' : 'קוד אימות נוצר בהצלחה',
            expiresAt: saveResult.expiresAt,
            voiceCallSent: voiceResult.success
        };
        
        // הוספת הקוד רק בסביבת development
        if (process.env.NODE_ENV === 'development') {
            response._code = code;
            response._phone = normalizedPhone;
        }
        
        res.json(response);
        
    } catch (err) {
        console.error('[phone-verification] Send code error:', err);
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};

plugin.apiVerifyCode = async function (req, res) {
    try {
        const { phoneNumber, code } = req.body;
        
        if (!phoneNumber || !code) {
            return res.json({ success: false, error: 'MISSING_PARAMS', message: 'חסרים פרמטרים' });
        }
        
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        const result = plugin.verifyCode(normalizedPhone, code);
        
        if (result.success) {
            plugin.markPhoneAsVerified(normalizedPhone);
        }
        
        res.json(result);
        
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
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
        
        if (await plugin.isPhoneExists(normalizedPhone)) {
            return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום במערכת' });
        }
        
        const code = plugin.generateVerificationCode();
        const saveResult = plugin.saveVerificationCode(normalizedPhone, code);
        
        if (!saveResult.success) {
            return res.json(saveResult);
        }
        
        res.json({ success: true, phone: normalizedPhone, code: code, expiresAt: saveResult.expiresAt });
        
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};

plugin.renderAdmin = function (req, res) {
    res.render('admin/plugins/phone-verification', {});
};

// ==================== User Profile Phone API ====================

/**
 * קבלת מידע טלפון של משתמש בפרופיל
 */
plugin.apiGetUserPhoneProfile = async function (req, res) {
    try {
        const { userslug } = req.params;
        const callerUid = req.uid;
        
        // מציאת ה-uid לפי slug
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) {
            return res.json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        const isAdmin = await User.isAdministrator(callerUid);
        
        // בדיקת הרשאות צפייה
        const showPhone = await db.getObjectField(`user:${uid}`, 'showPhone');
        const canView = isOwner || isAdmin || showPhone === '1' || showPhone === 1;
        
        if (!canView) {
            return res.json({ success: true, phone: null, hidden: true });
        }
        
        const phoneData = await plugin.getUserPhone(uid);
        
        res.json({
            success: true,
            phone: phoneData ? phoneData.phone : null,
            phoneVerified: phoneData ? phoneData.phoneVerified : false,
            showPhone: showPhone === '1' || showPhone === 1,
            isOwner: isOwner
        });
    } catch (err) {
        console.error('[phone-verification] Get user phone error:', err);
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

/**
 * עדכון מספר טלפון של משתמש
 */
plugin.apiUpdateUserPhone = async function (req, res) {
    try {
        const { userslug } = req.params;
        const { phoneNumber } = req.body;
        const callerUid = req.uid;
        
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) {
            return res.json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        // רק הבעלים או אדמין יכולים לעדכן
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        const isAdmin = await User.isAdministrator(callerUid);
        
        if (!isOwner && !isAdmin) {
            return res.json({ success: false, error: 'UNAUTHORIZED', message: 'אין הרשאה לעדכן' });
        }
        
        // אם מוחקים את הטלפון
        if (!phoneNumber || phoneNumber.trim() === '') {
            // מחיקת הטלפון הקיים
            const existingPhone = await plugin.getUserPhone(uid);
            if (existingPhone && existingPhone.phone) {
                await db.sortedSetRemove('phone:uid', existingPhone.phone);
                await db.sortedSetRemove('users:phone', uid);
            }
            await User.setUserFields(uid, {
                [PHONE_FIELD_KEY]: '',
                phoneVerified: 0,
                phoneVerifiedAt: 0
            });
            return res.json({ success: true, message: 'מספר הטלפון הוסר' });
        }
        
        // ולידציה
        if (!plugin.validatePhoneNumber(phoneNumber)) {
            return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        }
        
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        
        // בדיקה אם המספר כבר קיים למשתמש אחר
        const existingUid = await plugin.findUserByPhone(normalizedPhone);
        if (existingUid && parseInt(existingUid, 10) !== parseInt(uid, 10)) {
            return res.json({ success: false, error: 'PHONE_EXISTS', message: 'מספר הטלפון כבר רשום למשתמש אחר' });
        }
        
        // שמירת הטלפון (לא מאומת עדיין)
        const result = await plugin.savePhoneToUser(uid, normalizedPhone, false);
        
        if (result.success) {
            res.json({ success: true, message: 'מספר הטלפון נשמר. יש לאמת אותו כדי להשלים את התהליך', needsVerification: true });
        } else {
            res.json(result);
        }
    } catch (err) {
        console.error('[phone-verification] Update user phone error:', err);
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

/**
 * עדכון הגדרת הצגת הטלפון
 */
plugin.apiUpdatePhoneVisibility = async function (req, res) {
    try {
        const { userslug } = req.params;
        const { showPhone } = req.body;
        const callerUid = req.uid;
        
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) {
            return res.json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        // רק הבעלים יכול לשנות
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        if (!isOwner) {
            return res.json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        await db.setObjectField(`user:${uid}`, 'showPhone', showPhone ? '1' : '0');
        
        res.json({ success: true, showPhone: !!showPhone });
    } catch (err) {
        console.error('[phone-verification] Update phone visibility error:', err);
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

/**
 * אימות טלפון מפרופיל המשתמש
 */
plugin.apiVerifyUserPhone = async function (req, res) {
    try {
        const { userslug } = req.params;
        const { code } = req.body;
        const callerUid = req.uid;
        
        const uid = await User.getUidByUserslug(userslug);
        if (!uid) {
            return res.json({ success: false, error: 'USER_NOT_FOUND' });
        }
        
        const isOwner = parseInt(uid, 10) === parseInt(callerUid, 10);
        if (!isOwner) {
            return res.json({ success: false, error: 'UNAUTHORIZED' });
        }
        
        const phoneData = await plugin.getUserPhone(uid);
        if (!phoneData || !phoneData.phone) {
            return res.json({ success: false, error: 'NO_PHONE', message: 'לא נמצא מספר טלפון' });
        }
        
        const result = plugin.verifyCode(phoneData.phone, code);
        
        if (result.success) {
            // עדכון שהטלפון מאומת
            await User.setUserFields(uid, {
                phoneVerified: 1,
                phoneVerifiedAt: Date.now()
            });
            res.json({ success: true, message: 'מספר הטלפון אומת בהצלחה!' });
        } else {
            res.json(result);
        }
    } catch (err) {
        console.error('[phone-verification] Verify user phone error:', err);
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiAdminGetUsers = async function (req, res) {
    try {
        const users = await plugin.getAllUsersWithPhones();
        res.json({ success: true, users: users });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

plugin.apiAdminSearchByPhone = async function (req, res) {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.json({ success: false, error: 'MISSING_PHONE' });
        }
        
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

plugin.apiAdminGetUserPhone = async function (req, res) {
    try {
        const uid = parseInt(req.params.uid, 10);
        
        if (!uid) {
            return res.json({ success: false, error: 'INVALID_UID' });
        }
        
        const phoneData = await plugin.getUserPhone(uid);
        
        if (phoneData) {
            res.json({ success: true, ...phoneData });
        } else {
            res.json({ success: true, phone: null });
        }
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

/**
 * קבלת הגדרות - Admin API
 */
plugin.apiAdminGetSettings = async function (req, res) {
    try {
        const settings = await plugin.getSettings();
        // לא מחזירים את ה-API key המלא מטעמי אבטחה
        res.json({ 
            success: true, 
            settings: {
                voiceServerUrl: settings.voiceServerUrl,
                voiceServerApiKey: settings.voiceServerApiKey ? '********' : '',
                voiceServerEnabled: settings.voiceServerEnabled,
                hasApiKey: !!settings.voiceServerApiKey
            }
        });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

/**
 * שמירת הגדרות - Admin API
 */
plugin.apiAdminSaveSettings = async function (req, res) {
    try {
        const { voiceServerUrl, voiceServerApiKey, voiceServerEnabled } = req.body;
        
        // קבלת הגדרות קיימות
        const currentSettings = await plugin.getSettings();
        
        // אם ה-API key הוא ******** לא משנים אותו
        const newApiKey = voiceServerApiKey === '********' ? currentSettings.voiceServerApiKey : voiceServerApiKey;
        
        await plugin.saveSettings({
            voiceServerUrl: voiceServerUrl || '',
            voiceServerApiKey: newApiKey || '',
            voiceServerEnabled: voiceServerEnabled === true || voiceServerEnabled === 'true'
        });
        
        res.json({ success: true, message: 'ההגדרות נשמרו בהצלחה' });
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR' });
    }
};

/**
 * בדיקת שיחה קולית - Admin API
 */
plugin.apiAdminTestCall = async function (req, res) {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.json({ success: false, error: 'PHONE_REQUIRED', message: 'חובה להזין מספר טלפון' });
        }
        
        if (!plugin.validatePhoneNumber(phoneNumber)) {
            return res.json({ success: false, error: 'PHONE_INVALID', message: 'מספר הטלפון אינו תקין' });
        }
        
        const normalizedPhone = plugin.normalizePhone(phoneNumber);
        const testCode = '123456'; // קוד בדיקה קבוע
        
        const result = await plugin.sendVoiceCall(normalizedPhone, testCode);
        
        if (result.success) {
            res.json({ success: true, message: 'שיחת בדיקה נשלחה בהצלחה!' });
        } else {
            res.json({ success: false, error: result.error, message: result.message });
        }
    } catch (err) {
        res.json({ success: false, error: 'SERVER_ERROR', message: 'אירעה שגיאה' });
    }
};

module.exports = plugin;
