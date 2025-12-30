'use strict';

define('forum/phone-verification', ['hooks'], function (hooks) {
    
    // ==================== קבועים ====================
    const RESEND_COOLDOWN = 60; // שניות
    const PHONE_REGEX = /^05\d[-]?\d{7}$/;
    
    // ==================== משתנים ====================
    let resendTimer = null;
    let resendCountdown = 0;
    let phoneVerified = false;
    
    // ==================== פונקציות עזר ====================
    
    function validatePhone(phone) {
        return PHONE_REGEX.test(phone);
    }
    
    function showError(message) {
        $('#phone-error').text(message).removeClass('hidden').show();
        $('#phone-success').addClass('hidden').hide();
    }
    
    function showSuccess(message) {
        $('#phone-success').text(message).removeClass('hidden').show();
        $('#phone-error').addClass('hidden').hide();
    }
    
    function hideMessages() {
        $('#phone-error').addClass('hidden').hide();
        $('#phone-success').addClass('hidden').hide();
    }
    
    function startResendTimer() {
        resendCountdown = RESEND_COOLDOWN;
        updateResendButton();
        
        resendTimer = setInterval(function () {
            resendCountdown--;
            updateResendButton();
            
            if (resendCountdown <= 0) {
                clearInterval(resendTimer);
                resendTimer = null;
            }
        }, 1000);
    }
    
    function updateResendButton() {
        const $btn = $('#resend-code-btn');
        if (resendCountdown > 0) {
            $btn.prop('disabled', true).text('שלח שוב (' + resendCountdown + ')');
        } else {
            $btn.prop('disabled', false).text('שלח קוד שוב');
        }
    }
    
    function injectPhoneField() {
        const $form = $('[component="register/local"]');
        if (!$form.length) {
            return;
        }
        
        // בדיקה אם השדה כבר קיים
        if ($('#phoneNumber').length) {
            return;
        }
        
        const phoneHtml = `
            <div class="mb-2 d-flex flex-column gap-2" id="phone-verification-container">
                <label for="phoneNumber">מספר טלפון <span class="text-danger">*</span></label>
                <div class="d-flex flex-column">
                    <div class="input-group">
                        <input class="form-control" type="tel" name="phoneNumber" id="phoneNumber" 
                               placeholder="05X-XXXXXXX" dir="ltr" autocomplete="tel" />
                        <button class="btn btn-primary" type="button" id="send-code-btn">
                            <i class="fa fa-phone"></i> שלח קוד
                        </button>
                    </div>
                    <span class="form-text text-xs">תקבל שיחה קולית עם קוד אימות</span>
                    <div id="phone-error" class="text-danger text-xs hidden"></div>
                    <div id="phone-success" class="text-success text-xs hidden"></div>
                </div>
            </div>
            
            <div class="mb-2 d-flex flex-column gap-2 hidden" id="verification-code-container">
                <label for="verificationCode">קוד אימות</label>
                <div class="d-flex flex-column">
                    <div class="input-group">
                        <input class="form-control" type="text" id="verificationCode" 
                               placeholder="הזן קוד 6 ספרות" maxlength="6" dir="ltr" />
                        <button class="btn btn-success" type="button" id="verify-code-btn">
                            <i class="fa fa-check"></i> אמת
                        </button>
                    </div>
                    <button class="btn btn-link btn-sm p-0 text-start" type="button" id="resend-code-btn">
                        שלח קוד שוב
                    </button>
                </div>
            </div>
            
            <div id="phone-verified-badge" class="alert alert-success hidden">
                <i class="fa fa-check-circle"></i> מספר הטלפון אומת בהצלחה!
            </div>
        `;
        
        // הוספה לפני כפתור ההרשמה
        const $registerBtn = $form.find('button[type="submit"]');
        if ($registerBtn.length) {
            $(phoneHtml).insertBefore($registerBtn);
        } else {
            $form.append(phoneHtml);
        }
        
        attachEventListeners();
    }
    
    function attachEventListeners() {
        // שליחת קוד
        $('#send-code-btn').off('click').on('click', function () {
            const phone = $('#phoneNumber').val().trim();
            
            hideMessages();
            
            if (!phone) {
                showError('חובה להזין מספר טלפון');
                return;
            }
            
            if (!validatePhone(phone)) {
                showError('מספר הטלפון אינו תקין. פורמט נדרש: 05X-XXXXXXX');
                return;
            }
            
            const $btn = $(this);
            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> שולח...');
            
            $.ajax({
                url: config.relative_path + '/api/phone-verification/send-code',
                method: 'POST',
                data: { phoneNumber: phone },
                headers: {
                    'x-csrf-token': config.csrf_token
                },
                success: function (response) {
                    if (response.success) {
                        showSuccess('קוד אימות נוצר! תקבל שיחה בקרוב.');
                        $('#verification-code-container').removeClass('hidden');
                        $('#phoneNumber').prop('readonly', true);
                        $btn.addClass('hidden');
                        startResendTimer();
                    } else {
                        showError(response.message || 'אירעה שגיאה');
                        $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח קוד');
                    }
                },
                error: function () {
                    showError('אירעה שגיאה בשליחת הקוד');
                    $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח קוד');
                }
            });
        });
        
        // אימות קוד
        $('#verify-code-btn').off('click').on('click', function () {
            const phone = $('#phoneNumber').val().trim();
            const code = $('#verificationCode').val().trim();
            
            hideMessages();
            
            if (!code || code.length !== 6) {
                showError('יש להזין קוד בן 6 ספרות');
                return;
            }
            
            const $btn = $(this);
            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> מאמת...');
            
            $.ajax({
                url: config.relative_path + '/api/phone-verification/verify-code',
                method: 'POST',
                data: { phoneNumber: phone, code: code },
                headers: {
                    'x-csrf-token': config.csrf_token
                },
                success: function (response) {
                    if (response.success) {
                        phoneVerified = true;
                        $('#verification-code-container').addClass('hidden');
                        $('#phone-verification-container').addClass('hidden');
                        $('#phone-verified-badge').removeClass('hidden');
                        
                        // הסרת השדה המקורי כדי למנוע כפילות
                        $('#phoneNumber').prop('disabled', true).removeAttr('name');
                        
                        // הוספת שדה נסתר עם הטלפון המאומת
                        if (!$('#phoneNumberVerified').length) {
                            $('<input>').attr({
                                type: 'hidden',
                                name: 'phoneNumber',
                                id: 'phoneNumberVerified',
                                value: phone
                            }).appendTo('[component="register/local"]');
                        } else {
                            $('#phoneNumberVerified').val(phone);
                        }
                    } else {
                        showError(response.message || 'קוד שגוי');
                        $btn.prop('disabled', false).html('<i class="fa fa-check"></i> אמת');
                    }
                },
                error: function () {
                    showError('אירעה שגיאה באימות הקוד');
                    $btn.prop('disabled', false).html('<i class="fa fa-check"></i> אמת');
                }
            });
        });
        
        // שליחה חוזרת
        $('#resend-code-btn').off('click').on('click', function () {
            if (resendCountdown > 0) return;
            
            const phone = $('#phoneNumber').val().trim();
            const $btn = $(this);
            
            $btn.prop('disabled', true).text('שולח...');
            
            $.ajax({
                url: config.relative_path + '/api/phone-verification/send-code',
                method: 'POST',
                data: { phoneNumber: phone },
                headers: {
                    'x-csrf-token': config.csrf_token
                },
                success: function (response) {
                    if (response.success) {
                        showSuccess('קוד חדש נוצר!');
                        startResendTimer();
                    } else {
                        showError(response.message || 'אירעה שגיאה');
                        $btn.prop('disabled', false).text('שלח קוד שוב');
                    }
                },
                error: function () {
                    showError('אירעה שגיאה');
                    $btn.prop('disabled', false).text('שלח קוד שוב');
                }
            });
        });
        
        // ולידציה בזמן אמת
        $('#phoneNumber').off('input').on('input', function () {
            const phone = $(this).val().trim();
            if (phone && !validatePhone(phone)) {
                $(this).addClass('is-invalid');
            } else {
                $(this).removeClass('is-invalid');
            }
        });
        
        // מניעת שליחת טופס ללא אימות
        $('[component="register/local"]').off('submit.phone').on('submit.phone', function (e) {
            if (!phoneVerified) {
                e.preventDefault();
                e.stopPropagation();
                showError('יש לאמת את מספר הטלפון לפני ההרשמה');
                return false;
            }
        });
    }
    
    // ==================== אתחול ====================
    
    // פונקציית init שתיקרא על ידי NodeBB
    var PhoneVerification = {};
    
    PhoneVerification.init = function () {
        phoneVerified = false;
        injectPhoneField();
    };
    
    // האזנה לאירועי ajaxify
    hooks.on('action:ajaxify.end', function (data) {
        if (data.tpl_url === 'register' || data.url === 'register') {
            phoneVerified = false;
            setTimeout(injectPhoneField, 100);
        }
    });
    
    // אתחול ראשוני אם כבר בעמוד ההרשמה
    if (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.template && ajaxify.data.template.name === 'register') {
        setTimeout(injectPhoneField, 100);
    }
    
    return PhoneVerification;
});
