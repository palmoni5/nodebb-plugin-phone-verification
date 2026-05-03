'use strict';

define('forum/phone-verification', ['hooks', 'translator'], function (hooks, translator) {
    function tr(str) {
        return translator.translate(str);
    }

    function tx(key) {
        var args = Array.prototype.slice.call(arguments, 1);
        return translator.compile.apply(translator, ['phone-verification:' + key].concat(args));
    }
    
    function isValidIsraeliPhone(phone) {
        if (!phone) return false;
        const cleanPhone = phone.replace(/[-\s]/g, '');
        return /^05\d{8}$/.test(cleanPhone);
    }

    let publicSettingsCache = null;

    function loadPublicSettings() {
        if (publicSettingsCache) return $.Deferred().resolve(publicSettingsCache).promise();
        return $.getJSON(config.relative_path + '/api/phone-verification/public-settings')
            .then(function(res) {
                if (res && res.success && res.settings) {
                    publicSettingsCache = res.settings;
                } else {
                    publicSettingsCache = { voiceServerEnabled: true, userCallEnabled: false, userCallNumber: '' };
                }
                return publicSettingsCache;
            })
            .catch(function() {
                publicSettingsCache = { voiceServerEnabled: true, userCallEnabled: false, userCallNumber: '' };
                return publicSettingsCache;
            });
    }

    // ==================== Registration flow ====================
    
    const Registration = {
        resendTimer: null,
        resendCountdown: 0,
        phoneVerified: false,
        registerBtn: null,
        isInitializing: false,

        validatePhone: function(phone) {
            return isValidIsraeliPhone(phone);
        },

        showError: function(message) {
            tr(message).then(function (translated) {
                $('#phone-error').html(translated).removeClass('hidden').show();
                $('#phone-success').addClass('hidden').hide();
            });
        },

        showSuccess: function(message) {
            tr(message).then(function (translated) {
                $('#phone-success').html(translated).removeClass('hidden').show();
                $('#phone-error').addClass('hidden').hide();
            });
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
                tr(tx('registration.resend-countdown', this.resendCountdown)).then(function (translated) {
                    $btn.prop('disabled', true).text(translated);
                });
            } else {
                const method = this.getSelectedMethod();
                const key = method === 'user-call' ? 'registration.prepare-code-again' : 'registration.send-tzintuk-again';
                tr(tx(key)).then(function (translated) {
                    $btn.prop('disabled', false).text(translated);
                });
            }
        },

        init: function() {
            const self = this;
            const $form = $('[component="register/local"]');
            if (!$form.length) return;
            if (self.isInitializing) return;
            if ($form.data('phoneVerificationInitialized')) return;
            if ($('#phone-verification-container').length || $('#phoneNumber').length || $('#phoneNumberVerified').length) {
                $form.data('phoneVerificationInitialized', true);
                return;
            }
            
            self.isInitializing = true;
            self.phoneVerified = false;
            const $registerBtn = $form.find('button[type="submit"]');
            self.registerBtn = $registerBtn;
            if ($registerBtn.length) {
                $registerBtn.prop('disabled', true);
            }

            loadPublicSettings().then(function(settings) {
                const phoneHtml = self.buildPhoneHtml(settings);
                tr(phoneHtml).then(function (translatedHtml) {
                    if ($form.data('phoneVerificationInitialized') || $('#phone-verification-container').length || $('#phoneNumber').length) {
                        self.isInitializing = false;
                        $form.data('phoneVerificationInitialized', true);
                        return;
                    }

                    if ($registerBtn.length) {
                        $(translatedHtml).insertBefore($registerBtn);
                    } else {
                        $form.append(translatedHtml);
                    }

                    $form.data('phoneVerificationInitialized', true);
                    self.attachEventListeners(settings);
                    self.checkExistingVerification();
                    self.isInitializing = false;
                }).catch(function () {
                    self.isInitializing = false;
                });
            }).catch(function () {
                self.isInitializing = false;
            });
        },

        buildPhoneHtml: function(settings) {
            const showTzintuk = settings.voiceServerEnabled;
            const showUserCall = settings.userCallEnabled;
            const userCallNumber = settings.userCallNumber || '';
            const methodsHtml = `
                <div class="mb-2 d-flex flex-column gap-2 hidden" id="verification-methods">
                    <label class="form-label fw-bold">[[phone-verification:registration.choose-method]]</label>
                    <div class="d-flex flex-column gap-1">
                        ${showTzintuk ? `
                        <label class="form-check-label">
                            <input class="form-check-input" type="radio" name="verificationMethod" value="tzintuk" />
                            [[phone-verification:registration.method-tzintuk]]
                        </label>` : ''}
                        ${showUserCall ? `
                        <label class="form-check-label">
                            <input class="form-check-input" type="radio" name="verificationMethod" value="user-call" />
                            [[phone-verification:registration.method-user-call]]
                        </label>` : ''}
                    </div>
                    <div class="form-text text-xs" id="method-help"></div>
                    <div class="form-text text-xs" id="user-call-number-text" ${userCallNumber ? '' : 'style="display:none;"'}>${tx('registration.line-number', userCallNumber)}</div>
                </div>
            `;

            return `
                <div class="mb-2 d-flex flex-column gap-2" id="phone-verification-container">
                    <label for="phoneNumber">[[phone-verification:field.phone-number]] <span class="text-danger">*</span></label>
                    <div class="d-flex flex-column">
                        <div class="input-group">
                            <input class="form-control" type="tel" name="phoneNumber" id="phoneNumber" 
                                   placeholder="05X-XXXXXXX" dir="ltr" autocomplete="tel" />
                            <button class="btn btn-primary" type="button" id="send-code-btn">
                                <i class="fa fa-phone"></i> [[phone-verification:action.send-verification]]
                            </button>
                        </div>
                        ${methodsHtml}
                        <div id="phone-error" class="text-danger text-xs hidden"></div>
                        <div id="phone-success" class="text-success text-xs hidden"></div>
                    </div>
                </div>
                
                <div class="mb-2 d-flex flex-column gap-2 hidden" id="verification-code-container">
                    <label for="verificationCode">[[phone-verification:field.verification-code]]</label>
                    <div class="d-flex flex-column">
                        <div class="input-group">
                            <input class="form-control" type="text" id="verificationCode" 
                                   placeholder="[[phone-verification:placeholder.last-4-digits]]" maxlength="4" dir="ltr" />
                            <button class="btn btn-success" type="button" id="verify-code-btn">
                                <i class="fa fa-check"></i> [[phone-verification:action.verify]]
                            </button>
                        </div>
                        <button class="btn btn-link btn-sm p-0 text-start" type="button" id="resend-code-btn">
                            [[phone-verification:registration.send-tzintuk-again]]
                        </button>
                    </div>
                </div>
                
                <div id="phone-verified-badge" class="alert alert-success hidden">
                    <i class="fa fa-check-circle"></i> [[phone-verification:success.phone-verified]]
                </div>
            `;
        },

        getSelectedMethod: function() {
            const selected = $('input[name="verificationMethod"]:checked').val();
            return selected || 'tzintuk';
        },

        updateMethodHelp: function(settings) {
            const method = this.getSelectedMethod();
            if (method === 'user-call') {
                tr(tx('help.user-call')).then(function (translated) {
                    $('#method-help').text(translated);
                });
                tr(tx('placeholder.code-from-call')).then(function (translated) {
                    $('#verificationCode').attr('placeholder', translated);
                });
                $('#user-call-number-text').toggle(!!(settings.userCallNumber && settings.userCallNumber.length));
            } else {
                tr(tx('help.tzintuk')).then(function (translated) {
                    $('#method-help').text(translated);
                });
                tr(tx('placeholder.last-4-digits')).then(function (translated) {
                    $('#verificationCode').attr('placeholder', translated);
                });
                $('#user-call-number-text').hide();
            }
        },

        attachEventListeners: function(settings) {
            const self = this;

            function showMethodsIfValid() {
                const phone = $('#phoneNumber').val().trim();
                if (self.validatePhone(phone)) {
                    $('#verification-methods').removeClass('hidden');
                    if ($('input[name="verificationMethod"]:checked').length === 0) {
                        if (settings.voiceServerEnabled) {
                            $('input[name="verificationMethod"][value="tzintuk"]').prop('checked', true);
                        } else if (settings.userCallEnabled) {
                            $('input[name="verificationMethod"][value="user-call"]').prop('checked', true);
                        }
                    }
                    self.updateMethodHelp(settings);
                } else {
                    $('#verification-methods').addClass('hidden');
                }
            }

            $('#phoneNumber').on('input blur', function() {
                showMethodsIfValid();
            });

            $('body').on('change', 'input[name="verificationMethod"]', function() {
                self.updateMethodHelp(settings);
                self.updateResendButton();
            });

            function requestVerification(method) {
                const phone = $('#phoneNumber').val().trim();
                self.hideMessages();

                const $btn = $('#send-code-btn');
                tr(tx('status.sending')).then(function (translated) {
                    $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> ' + translated);
                });

                if (method === 'user-call') {
                    $.ajax({
                        url: config.relative_path + '/api/phone-verification/request-user-call',
                        method: 'POST',
                        data: { phoneNumber: phone },
                        headers: { 'x-csrf-token': config.csrf_token },
                        success: function (response) {
                            if (response.success) {
                                var successMessage = response.message || tx('success.user-call-ready');
                                if (response.callNumber) {
                                    successMessage += ' ' + tx('registration.line-number', response.callNumber);
                                }
                                self.showSuccess(successMessage);
                                $('#verification-code-container').removeClass('hidden');
                                $('#phoneNumber').prop('readonly', true);
                                $btn.addClass('hidden');
                                self.startResendTimer();
                            } else {
                                self.showError(response.message || tx('error.send-request-failed'));
                                tr(tx('action.send-verification')).then(function (translated) {
                                    $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> ' + translated);
                                });
                            }
                        },
                        error: function() {
                            self.showError(tx('error.network'));
                            tr(tx('action.send-verification')).then(function (translated) {
                                $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> ' + translated);
                            });
                        }
                    });
                    return;
                }

                $.ajax({
                    url: config.relative_path + '/api/phone-verification/send-code',
                    method: 'POST',
                    data: { phoneNumber: phone },
                    headers: { 'x-csrf-token': config.csrf_token },
                    success: function (response) {
                        if (response.success) {
                            self.showSuccess(response.message || tx('success.tzintuk-sent-client'));
                            $('#verification-code-container').removeClass('hidden');
                            $('#phoneNumber').prop('readonly', true);
                            $btn.addClass('hidden');
                            self.startResendTimer();
                        } else {
                            self.showError(response.message || tx('error.send-request-failed'));
                            tr(tx('action.send-verification')).then(function (translated) {
                                $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> ' + translated);
                            });
                        }
                    },
                    error: function() {
                        self.showError(tx('error.network'));
                        tr(tx('action.send-verification')).then(function (translated) {
                            $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> ' + translated);
                        });
                    }
                });
            }

            $('#send-code-btn').off('click').on('click', function () {
                const method = self.getSelectedMethod();
                requestVerification(method);
            });

            $('#verify-code-btn').off('click').on('click', function () {
                const phone = $('#phoneNumber').val().trim();
                const code = $('#verificationCode').val().trim();
                self.hideMessages();
                
                if (!code || code.length < 4) {
                    self.showError(tx('error.enter-4-digits'));
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
                            if (self.registerBtn && self.registerBtn.length) {
                                self.registerBtn.prop('disabled', false);
                            }
                        } else {
                            self.showError(response.message || tx('error.code-invalid'));
                        }
                    }
                });
            });

            $('#resend-code-btn').off('click').on('click', function () {
                if (self.resendCountdown > 0) return;
                const method = self.getSelectedMethod();
                $('#send-code-btn').removeClass('hidden');
                requestVerification(method);
            });

            $('[component="register/local"]').off('submit.phone').on('submit.phone', function (e) {
                if (!self.phoneVerified) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.showError(tx('error.verify-before-register'));
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

    // ==================== Edit profile flow ====================

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
            
            const buttonLabel = hasPhone ? '[[phone-verification:profile.verify-phone]]' : '[[phone-verification:profile.add-phone]]';
            
            const menuHtml = `
                <li class="list-group-item" id="sidebar-phone-li">
                    <a href="#" id="sidebar-phone-link" class="text-decoration-none text-reset">
                        ${buttonLabel}
                    </a>
                </li>
            `;
            const $passwordLink = $('a[href$="/edit/password"]');
            
            if ($passwordLink.length) {
                tr(menuHtml).then(function (translated) {
                    $passwordLink.closest('li').after(translated);
                });
            } else {
                tr(menuHtml).then(function (translated) {
                    $('.list-group').first().append(translated);
                });
            }

            $('#sidebar-phone-link').off('click').on('click', function(e) {
                e.preventDefault();
                openPhoneManagementModal(response.phone, response.phoneVerified, userslug);
            });
        });
    }

    function openPhoneManagementModal(currentPhone, isVerified, userslug) {
        const phoneVal = currentPhone || '';
        
        // Phone update modal
        const modalHtml = `
            <div class="phone-modal-content">
                <div class="mb-3">
                    <label class="form-label fw-bold">[[phone-verification:profile.mobile-phone]]</label>
                    <div class="input-group">
                        <input class="form-control" type="tel" id="modal-phoneNumber" value="${phoneVal}" placeholder="05X-XXXXXXX" dir="ltr">
                    </div>
                    <div class="form-text text-muted mt-2">
                        <i class="fa fa-info-circle"></i> 
                        ${isVerified 
                            ? '[[phone-verification:profile.current-verified-info]]' 
                            : '[[phone-verification:profile.enter-number-info]]'}
                    </div>
                </div>
                <div id="modal-alert-area"></div>
            </div>
        `;

        const dialog = bootbox.dialog({
            title: isVerified ? '[[phone-verification:profile.change-title]]' : '[[phone-verification:profile.update-title]]',
            message: modalHtml,
            buttons: {
                cancel: {
                    label: '[[phone-verification:action.cancel]]',
                    className: 'btn-ghost'
                },
                verify: {
                    label: '[[phone-verification:action.continue-verification]]',
                    className: 'btn-primary',
                    callback: function() {
                        const newPhone = $('#modal-phoneNumber').val();
                        
                        if (!isValidIsraeliPhone(newPhone)) {
                            showModalAlert(tx('error.invalid-phone-format'), 'danger');
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
        tr(msg).then(function (translated) {
            const html = `<div class="alert alert-${type} p-2 mt-2">${translated}</div>`;
            $('#modal-alert-area').html(html);
        });
    }

    function performPhoneUpdate(phone, userslug, dialog) {
        const $btn = dialog.find('.bootbox-accept'); 
        tr(tx('status.sending')).then(function (translated) {
            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> ' + translated);
        });

        $.post(config.relative_path + '/api/user/' + userslug + '/phone', { 
            phoneNumber: phone,
            _csrf: config.csrf_token 
        }, function(res) {
            if (!res.success) {
                showModalAlert(res.message || res.error, 'danger');
                tr(tx('action.continue-verification')).then(function (translated) {
                    $btn.prop('disabled', false).text(translated);
                });
                return;
            }

            loadPublicSettings().then(function(settings) {
                function askForCode(title) {
                    bootbox.prompt({
                        title: title,
                        inputType: 'number',
                        callback: function (code) {
                            if (!code) return;
                            
                            $.post(config.relative_path + '/api/user/' + userslug + '/phone/verify', {
                                code: code,
                                _csrf: config.csrf_token
                            }, function(verifyRes){
                                if(verifyRes.success) {
                                    tr(tx('success.phone-updated-verified')).then(function (translated) {
                                        app.alertSuccess(translated);
                                    });
                                    ajaxify.refresh(); 
                                } else {
                                    tr(verifyRes.message || tx('error.code-invalid')).then(function (translated) {
                                        app.alertError(translated);
                                    });
                                }
                            });
                        }
                    });
                }

                function sendByMethod(method) {
                    if (method === 'user-call') {
                        $.post(config.relative_path + '/api/phone-verification/request-user-call', { 
                            phoneNumber: phone,
                            _csrf: config.csrf_token 
                        }, function(callRes) {
                            if (callRes.success) {
                                dialog.modal('hide');
                                var title = tx('prompt.call-line-title');
                                if (callRes.callNumber) title += " (" + callRes.callNumber + ")";
                                askForCode(title);
                            } else {
                                showModalAlert(callRes.message || tx('error.prepare-code-failed'), 'danger');
                                tr(tx('action.continue-verification')).then(function (translated) {
                                    $btn.prop('disabled', false).text(translated);
                                });
                            }
                        });
                        return;
                    }

                    $.post(config.relative_path + '/api/phone-verification/send-code', { 
                        phoneNumber: phone,
                        _csrf: config.csrf_token 
                    }, function(callRes) {
                        if (callRes.success) {
                            dialog.modal('hide'); 
                            askForCode(tx('prompt.enter-last-4'));
                        } else {
                            showModalAlert(callRes.message || tx('error.tzintuk-send-failed'), 'danger');
                            tr(tx('action.continue-verification')).then(function (translated) {
                                $btn.prop('disabled', false).text(translated);
                            });
                        }
                    });
                }

                if (settings.voiceServerEnabled && settings.userCallEnabled) {
                    bootbox.dialog({
                        title: '[[phone-verification:dialog.choose-verification-method]]',
                        message: '[[phone-verification:dialog.choose-verification-message]]',
                        buttons: {
                            tzintuk: {
                                label: '[[phone-verification:action.tzintuk]]',
                                className: 'btn-primary',
                                callback: function() { sendByMethod('tzintuk'); }
                            },
                            userCall: {
                                label: '[[phone-verification:action.user-call]]',
                                className: 'btn-success',
                                callback: function() { sendByMethod('user-call'); }
                            }
                        }
                    });
                } else if (settings.userCallEnabled) {
                    sendByMethod('user-call');
                } else {
                    sendByMethod('tzintuk');
                }
            });
        });
    }

    // ==================== View profile flow ====================

    function handleProfileView() {
        if ($('#user-phone-stat-item').length > 0) return;

        const userslug = ajaxify.data.userslug;
        
        $.getJSON(config.relative_path + '/api/user/' + userslug + '/phone', function (response) {
            if (!response.success) return;
            
            if (!response.phone) return;

            if ($('#user-phone-stat-item').length > 0) return;

            const verifyBadge = response.phoneVerified 
                ? '<i class="" title=""></i>' 
                : '<i class="fa fa-exclamation-triangle text-warning" title="[[phone-verification:status.not-verified]]" style="cursor:pointer;" onclick="location.href=\'' + config.relative_path + '/user/' + userslug + '/edit\'"></i>';

            const privacyLabel = response.isOwner 
                ? ' <span class="text-lowercase">([[phone-verification:label.hidden]])</span>' 
                : '';

            const phoneText = response.phone;
            
            const html = `
                <div class="stat" id="user-phone-stat-item">
                    <div class="align-items-center justify-content-center card card-header p-3 border-0 rounded-1 h-100 gap-2">
                        <span class="stat-label text-xs fw-semibold">
                            <i class="text-muted fa-solid fa-phone"></i> 
                            <span>[[phone-verification:label.phone-number]]</span>${privacyLabel}
                        </span>
                        <span class="text-sm text-center text-break w-100 px-2 ff-secondary" dir="ltr">
                            ${phoneText} ${verifyBadge}
                        </span>
                    </div>
                </div>
            `;

            const $statsRow = $('.account-stats .row');
            if ($statsRow.length) {
                tr(html).then(function (translated) {
                    $statsRow.append(translated);
                });
            } else {
                if ($('.profile-meta').length) {
                    tr(html).then(function (translated) {
                        $('.profile-meta').append(translated);
                    });
                } else if ($('.fullname').length) {
                    tr(html).then(function (translated) {
                        $('.fullname').after(translated);
                    });
                }
            }
        });
    }

    // ==================== Main route dispatch ====================

    const Plugin = {};

    Plugin.init = function () {
        checkRoute();
    };

    function checkRoute() {
        if (!ajaxify.data.template) return;

        // 1. Registration page
        if (ajaxify.data.template.name === 'register' || ajaxify.data.template.name === 'registerComplete') {
            Registration.init();
        }
        // 2. Profile edit page
        else if (ajaxify.data.template.name === 'account/edit') {
            handleProfileEdit();
        }
        // 3. Profile view page
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
