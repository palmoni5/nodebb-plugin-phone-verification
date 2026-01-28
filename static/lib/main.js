'use strict';

define('forum/phone-verification', ['hooks', 'translator'], function (hooks, translator) {
    
    function isValidIsraeliPhone(phone) {
        if (!phone) return false;
        const cleanPhone = phone.replace(/[-\s]/g, '');
        return /^05\d{8}$/.test(cleanPhone);
    }

    // ==================== לוגיקה לעמוד הרשמה (Registration) ====================
    
    const Registration = {
        resendTimer: null,
        resendCountdown: 0,
        phoneVerified: false,

        validatePhone: function(phone) {
            return isValidIsraeliPhone(phone);
        },

        showError: function(message) {
            $('#phone-error').text(message).removeClass('hidden').show();
            $('#phone-success').addClass('hidden').hide();
        },

        showSuccess: function(message) {
            $('#phone-success').text(message).removeClass('hidden').show();
            $('#phone-error').addClass('hidden').hide();
        },

        hideMessages: function() {
            $('#phone-error').addClass('hidden').hide();
            $('#phone-success').addClass('hidden').hide();
        },

        startResendTimer: function() {
            const self = this;
            self.resendCountdown = 60;
            self.updateResendButton();
            
            self.resendTimer = setInterval(function () {
                self.resendCountdown--;
                self.updateResendButton();
                
                if (self.resendCountdown <= 0) {
                    clearInterval(self.resendTimer);
                    self.resendTimer = null;
                }
            }, 1000);
        },

        updateResendButton: function() {
            const $btn = $('#resend-code-btn');
            if (this.resendCountdown > 0) {
                $btn.prop('disabled', true).text('שלח שוב (' + this.resendCountdown + ')');
            } else {
                $btn.prop('disabled', false).text('שלח צינתוק שוב');
            }
        },

        init: function() {
            const self = this;
            const $form = $('[component="register/local"]');
            if (!$form.length) return;
            if ($('#phoneNumber').length) return; 
            
            self.phoneVerified = false;

            // עדכון טקסטים לצינתוק
            const phoneHtml = `
                <div class="mb-2 d-flex flex-column gap-2" id="phone-verification-container">
                    <label for="phoneNumber">מספר טלפון <span class="text-danger">*</span></label>
                    <div class="d-flex flex-column">
                        <div class="input-group">
                            <input class="form-control" type="tel" name="phoneNumber" id="phoneNumber" 
                                   placeholder="05X-XXXXXXX" dir="ltr" autocomplete="tel" />
                            <button class="btn btn-primary" type="button" id="send-code-btn">
                                <i class="fa fa-phone"></i> שלח לאימות
                            </button>
                        </div>
                        <span class="form-text text-xs">תקבל שיחה (צינתוק). קוד האימות הוא <strong>4 הספרות האחרונות</strong> של המספר המתקשר.</span>
                        <div id="phone-error" class="text-danger text-xs hidden"></div>
                        <div id="phone-success" class="text-success text-xs hidden"></div>
                    </div>
                </div>
                
                <div class="mb-2 d-flex flex-column gap-2 hidden" id="verification-code-container">
                    <label for="verificationCode">קוד אימות</label>
                    <div class="d-flex flex-column">
                        <div class="input-group">
                            <input class="form-control" type="text" id="verificationCode" 
                                   placeholder="4 ספרות אחרונות של המספר המחייג" maxlength="4" dir="ltr" />
                            <button class="btn btn-success" type="button" id="verify-code-btn">
                                <i class="fa fa-check"></i> אמת
                            </button>
                        </div>
                        <button class="btn btn-link btn-sm p-0 text-start" type="button" id="resend-code-btn">
                            שלח צינתוק שוב
                        </button>
                    </div>
                </div>
                
                <div id="phone-verified-badge" class="alert alert-success hidden">
                    <i class="fa fa-check-circle"></i> מספר הטלפון אומת בהצלחה!
                </div>
            `;
            
            const $registerBtn = $form.find('button[type="submit"]');
            if ($registerBtn.length) {
                $(phoneHtml).insertBefore($registerBtn);
            } else {
                $form.append(phoneHtml);
            }

            self.attachEventListeners();
            self.checkExistingVerification();
        },

        attachEventListeners: function() {
            const self = this;

            $('#send-code-btn').off('click').on('click', function () {
                const phone = $('#phoneNumber').val().trim();
                self.hideMessages();
                
                const $btn = $(this);
                $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> שולח...');
                
                $.ajax({
                    url: config.relative_path + '/api/phone-verification/send-code',
                    method: 'POST',
                    data: { phoneNumber: phone },
                    headers: { 'x-csrf-token': config.csrf_token },
                    success: function (response) {
                        if (response.success) {
                            self.showSuccess('צינתוק נשלח! בדוק את השיחות הנכנסות.');
                            $('#verification-code-container').removeClass('hidden');
                            $('#phoneNumber').prop('readonly', true);
                            $btn.addClass('hidden');
                            self.startResendTimer();
                        } else {
                            self.showError(response.message || 'שגיאה בשליחה');
                            $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח לאימות');
                        }
                    },
                    error: function() {
                        self.showError('שגיאת תקשורת');
                        $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח לאימות');
                    }
                });
            });

            $('#verify-code-btn').off('click').on('click', function () {
                const phone = $('#phoneNumber').val().trim();
                const code = $('#verificationCode').val().trim();
                self.hideMessages();
                
                if (!code || code.length < 4) {
                    self.showError('נא להזין 4 ספרות');
                    return;
                }
                
                $.ajax({
                    url: config.relative_path + '/api/phone-verification/verify-code',
                    method: 'POST',
                    data: { phoneNumber: phone, code: code },
                    headers: { 'x-csrf-token': config.csrf_token },
                    success: function (response) {
                        if (response.success) {
                            self.phoneVerified = true;
                            $('#verification-code-container, #phone-verification-container').addClass('hidden');
                            $('#phone-verified-badge').removeClass('hidden');
                            
                            $('#phoneNumber').prop('disabled', true).removeAttr('name');
                            if (!$('#phoneNumberVerified').length) {
                                $('<input>').attr({type: 'hidden', name: 'phoneNumber', id: 'phoneNumberVerified', value: phone}).appendTo('[component="register/local"]');
                            } else {
                                $('#phoneNumberVerified').val(phone);
                            }
                        } else {
                            self.showError(response.message || 'קוד שגוי');
                        }
                    }
                });
            });

            $('[component="register/local"]').off('submit.phone').on('submit.phone', function (e) {
                if (!self.phoneVerified) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.showError('יש לאמת את מספר הטלפון לפני ההרשמה');
                    return false;
                }
            });
        },

        checkExistingVerification: function() {
            const phone = $('#phoneNumber').val();
            if (phone && this.validatePhone(phone)) {
            }
        }
    };

    // ==================== לוגיקה לעריכת פרופיל (Edit Profile) ====================

    function handleProfileEdit() {
        if ($('#sidebar-phone-li').length > 0) return;

        const userslug = ajaxify.data.userslug;

        $.getJSON(config.relative_path + '/api/user/' + userslug + '/phone', function (response) {
            if ($('#sidebar-phone-li').length > 0) return;

            if (!response.success) return;

            if (response.phone && response.phoneVerified) {
                return;
            }
     
            const hasPhone = response.phone && response.phone.length > 0;
            
            const buttonLabel = hasPhone ? 'אמת מספר טלפון' : 'הוסף מספר טלפון';
            
            const menuHtml = `
                <li class="list-group-item" id="sidebar-phone-li">
                    <a href="#" id="sidebar-phone-link" class="text-decoration-none text-reset">
                        ${buttonLabel}
                    </a>
                </li>
            `;
            const $passwordLink = $('a[href$="/edit/password"]');
            
            if ($passwordLink.length) {
                $passwordLink.closest('li').after(menuHtml);
            } else {
                $('.list-group').first().append(menuHtml);
            }

            $('#sidebar-phone-link').off('click').on('click', function(e) {
                e.preventDefault();
                openPhoneManagementModal(response.phone, response.phoneVerified, userslug);
            });
        });
    }

    function openPhoneManagementModal(currentPhone, isVerified, userslug) {
        const phoneVal = currentPhone || '';
        
        // עדכון טקסטים במודאל
        const modalHtml = `
            <div class="phone-modal-content">
                <div class="mb-3">
                    <label class="form-label fw-bold">מספר טלפון נייד</label>
                    <div class="input-group">
                        <input class="form-control" type="tel" id="modal-phoneNumber" value="${phoneVal}" placeholder="05X-XXXXXXX" dir="ltr">
                    </div>
                    <div class="form-text text-muted mt-2">
                        <i class="fa fa-info-circle"></i> 
                        ${isVerified 
                            ? 'המספר הנוכחי מאומת. שינוי המספר יחייב אימות מחדש.' 
                            : 'יש להזין מספר ולקבל צינתוק לאימות.'}
                    </div>
                </div>
                <div id="modal-alert-area"></div>
            </div>
        `;

        const dialog = bootbox.dialog({
            title: isVerified ? 'שינוי מספר טלפון' : 'עדכון מספר טלפון',
            message: modalHtml,
            buttons: {
                cancel: {
                    label: 'ביטול',
                    className: 'btn-ghost'
                },
                verify: {
                    label: 'שלח צינתוק',
                    className: 'btn-primary',
                    callback: function() {
                        const newPhone = $('#modal-phoneNumber').val();
                        
                        if (!isValidIsraeliPhone(newPhone)) {
                            showModalAlert('נא להזין מספר תקין (05X-XXXXXXX)', 'danger');
                            return false; 
                        }

                        performPhoneUpdate(newPhone, userslug, dialog);
                        return false; 
                    }
                }
            }
        });
    }

    function showModalAlert(msg, type) {
        const html = `<div class="alert alert-${type} p-2 mt-2">${msg}</div>`;
        $('#modal-alert-area').html(html);
    }

    function performPhoneUpdate(phone, userslug, dialog) {
        const $btn = dialog.find('.bootbox-accept'); 
        $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> שולח...');

        $.post(config.relative_path + '/api/user/' + userslug + '/phone', { 
            phoneNumber: phone,
            _csrf: config.csrf_token 
        }, function(res) {
            if (!res.success) {
                showModalAlert(res.message || res.error, 'danger');
                $btn.prop('disabled', false).text('שלח צינתוק');
                return;
            }

            $.post(config.relative_path + '/api/phone-verification/send-code', { 
                phoneNumber: phone,
                _csrf: config.csrf_token 
            }, function(callRes) {
                if (callRes.success) {
                    dialog.modal('hide'); 
                    
                    // עדכון ה-Prompt לקליטת 4 ספרות
                    bootbox.prompt({
                        title: "הזן את 4 הספרות האחרונות של המספר שחייג אליך כעת",
                        inputType: 'number',
                        callback: function (code) {
                            if (!code) return;
                            
                            $.post(config.relative_path + '/api/user/' + userslug + '/phone/verify', {
                                code: code,
                                _csrf: config.csrf_token
                            }, function(verifyRes){
                                if(verifyRes.success) {
                                    app.alertSuccess('הטלפון עודכן ואומת בהצלחה!');
                                    ajaxify.refresh(); 
                                } else {
                                    app.alertError(verifyRes.message || 'קוד שגוי');
                                }
                            });
                        }
                    });
                } else {
                    showModalAlert(callRes.message || 'שגיאה בשליחת הצינתוק', 'danger');
                    $btn.prop('disabled', false).text('שלח צינתוק');
                }
            });
        });
    }

    // ==================== לוגיקה לצפייה בפרופיל (View Profile) ====================

    function handleProfileView() {
        if ($('#user-phone-stat-item').length > 0) return;

        const userslug = ajaxify.data.userslug;
        
        $.getJSON(config.relative_path + '/api/user/' + userslug + '/phone', function (response) {
            if (!response.success) return;
            
            if (!response.phone) return;

            if ($('#user-phone-stat-item').length > 0) return;

            const verifyBadge = response.phoneVerified 
                ? '<i class="" title=""></i>' 
                : '<i class="fa fa-exclamation-triangle text-warning" title="לא מאומת" style="cursor:pointer;" onclick="location.href=\'' + config.relative_path + '/user/' + userslug + '/edit\'"></i>';

            const privacyLabel = response.isOwner 
                ? ' <span class="text-lowercase">(מוסתר)</span>' 
                : '';

            const phoneText = response.phone;
            
            const html = `
                <div class="stat" id="user-phone-stat-item">
                    <div class="align-items-center justify-content-center card card-header p-3 border-0 rounded-1 h-100 gap-2">
                        <span class="stat-label text-xs fw-semibold">
                            <i class="text-muted fa-solid fa-phone"></i> 
                            <span>מספר טלפון</span>${privacyLabel}
                        </span>
                        <span class="text-sm text-center text-break w-100 px-2 ff-secondary" dir="ltr">
                            ${phoneText} ${verifyBadge}
                        </span>
                    </div>
                </div>
            `;

            const $statsRow = $('.account-stats .row');
            if ($statsRow.length) {
                $statsRow.append(html);
            } else {
                if ($('.profile-meta').length) {
                    $('.profile-meta').append(html);
                } else if ($('.fullname').length) {
                    $('.fullname').after(html);
                }
            }
        });
    }

    // ==================== ראשי - ניתוב לפי דף ====================

    const Plugin = {};

    Plugin.init = function () {
        checkRoute();
    };

    function checkRoute() {
        if (!ajaxify.data.template) return;

        // 1. דף הרשמה
        if (ajaxify.data.template.name === 'register' || ajaxify.data.template.name === 'registerComplete') {
            Registration.init();
        }
        // 2. דף עריכת פרופיל
        else if (ajaxify.data.template.name === 'account/edit') {
            handleProfileEdit();
        }
        // 3. דף צפייה בפרופיל
        else if (ajaxify.data.template.name === 'account/profile') {
            handleProfileView();
        }
    }

    hooks.on('action:ajaxify.end', function (data) {
        checkRoute();
    });

    if (typeof ajaxify !== 'undefined' && ajaxify.data) {
        checkRoute();
    }

    return Plugin;
});