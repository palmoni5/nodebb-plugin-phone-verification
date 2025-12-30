'use strict';

/* globals $, config, app */

define('admin/plugins/phone-verification', ['csrf'], function (csrf) {
    var ACP = {};

    ACP.init = function () {
        loadSettings();
        loadUsers();
        
        // שמירת הגדרות
        $('#voice-settings-form').on('submit', function (e) {
            e.preventDefault();
            saveSettings();
        });
        
        // בדיקת שיחה
        $('#test-call-btn').on('click', testCall);
        
        // חיפוש
        $('#search-btn').on('click', searchByPhone);
        $('#phone-search').on('keypress', function (e) {
            if (e.which === 13) searchByPhone();
        });
    };
    
    function loadSettings() {
        $.ajax({
            url: config.relative_path + '/api/admin/plugins/phone-verification/settings',
            method: 'GET',
            success: function (response) {
                if (response.success) {
                    var settings = response.settings;
                    $('#voiceServerEnabled').prop('checked', settings.voiceServerEnabled);
                    if (settings.hasApiKey) {
                        $('#voiceServerApiKey').val('********');
                    }
                }
            }
        });
    }
    
    function saveSettings() {
        var $btn = $('#save-settings-btn');
        $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> שומר...');
        
        $.ajax({
            url: config.relative_path + '/api/admin/plugins/phone-verification/settings',
            method: 'POST',
            headers: {
                'x-csrf-token': csrf.get()
            },
            data: {
                voiceServerEnabled: $('#voiceServerEnabled').is(':checked'),
                voiceServerApiKey: $('#voiceServerApiKey').val()
            },
            success: function (response) {
                if (response.success) {
                    $('#settings-status').show().delay(2000).fadeOut();
                } else {
                    alert('שגיאה בשמירת ההגדרות: ' + (response.message || response.error));
                }
                $btn.prop('disabled', false).html('<i class="fa fa-save"></i> שמור הגדרות');
            },
            error: function (xhr) {
                var msg = 'שגיאה בשמירת ההגדרות';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    msg += ': ' + xhr.responseJSON.message;
                }
                alert(msg);
                $btn.prop('disabled', false).html('<i class="fa fa-save"></i> שמור הגדרות');
            }
        });
    }
    
    function testCall() {
        var phone = $('#test-phone').val().trim();
        var $btn = $('#test-call-btn');
        var $status = $('#test-status');
        
        if (!phone) {
            $status.html('<span class="text-danger">יש להזין מספר טלפון</span>');
            return;
        }
        
        $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> שולח...');
        $status.html('');
        
        $.ajax({
            url: config.relative_path + '/api/admin/plugins/phone-verification/test-call',
            method: 'POST',
            data: { phoneNumber: phone },
            success: function (response) {
                if (response.success) {
                    $status.html('<span class="text-success"><i class="fa fa-check"></i> ' + response.message + '</span>');
                } else {
                    $status.html('<span class="text-danger"><i class="fa fa-times"></i> ' + response.message + '</span>');
                }
                $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח שיחת בדיקה');
            },
            error: function () {
                $status.html('<span class="text-danger">שגיאה בשליחת השיחה</span>');
                $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח שיחת בדיקה');
            }
        });
    }
    
    function loadUsers() {
        $.ajax({
            url: config.relative_path + '/api/admin/plugins/phone-verification/users',
            method: 'GET',
            success: function (response) {
                if (response.success) {
                    renderUsers(response.users);
                    updateStats(response.users);
                } else {
                    showTableError('שגיאה בטעינת הנתונים');
                }
            },
            error: function () {
                showTableError('שגיאה בטעינת הנתונים');
            }
        });
    }
    
    function renderUsers(users) {
        var $tbody = $('#users-tbody');
        $tbody.empty();
        
        if (!users || users.length === 0) {
            $tbody.html('<tr><td colspan="4" class="text-center">אין משתמשים עם מספרי טלפון</td></tr>');
            return;
        }
        
        users.forEach(function (user) {
            var verifiedDate = user.phoneVerifiedAt ? 
                new Date(user.phoneVerifiedAt).toLocaleString('he-IL') : '-';
            var statusBadge = user.phoneVerified ? 
                '<span class="label label-success">מאומת</span>' : 
                '<span class="label label-warning">לא מאומת</span>';
            
            var row = '<tr>' +
                '<td><a href="' + config.relative_path + '/admin/manage/users/' + user.uid + '">' + user.uid + '</a></td>' +
                '<td dir="ltr">' + formatPhone(user.phone) + '</td>' +
                '<td>' + verifiedDate + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '</tr>';
            
            $tbody.append(row);
        });
    }
    
    function updateStats(users) {
        $('#total-users').text(users.length);
        var verified = users.filter(function (u) { return u.phoneVerified; }).length;
        $('#verified-count').text(verified);
    }
    
    function searchByPhone() {
        var phone = $('#phone-search').val().trim();
        
        if (!phone) {
            showSearchResult('warning', 'יש להזין מספר טלפון');
            return;
        }
        
        $.ajax({
            url: config.relative_path + '/api/admin/plugins/phone-verification/search',
            method: 'GET',
            data: { phone: phone },
            success: function (response) {
                if (response.success) {
                    if (response.found) {
                        var user = response.user;
                        var html = '<strong>נמצא משתמש!</strong><br>' +
                            'מזהה: <a href="' + config.relative_path + '/admin/manage/users/' + user.uid + '">' + user.uid + '</a><br>' +
                            'טלפון: ' + formatPhone(user.phone) + '<br>' +
                            'סטטוס: ' + (user.phoneVerified ? 'מאומת' : 'לא מאומת');
                        showSearchResult('success', html);
                    } else {
                        showSearchResult('info', 'לא נמצא משתמש עם מספר טלפון זה');
                    }
                } else {
                    showSearchResult('danger', 'שגיאה בחיפוש');
                }
            },
            error: function () {
                showSearchResult('danger', 'שגיאה בחיפוש');
            }
        });
    }
    
    function showSearchResult(type, message) {
        $('#search-result').show();
        $('#search-alert')
            .removeClass('alert-success alert-danger alert-warning alert-info')
            .addClass('alert-' + type)
            .html(message);
    }
    
    function showTableError(message) {
        $('#users-tbody').html('<tr><td colspan="4" class="text-center text-danger">' + message + '</td></tr>');
    }
    
    function formatPhone(phone) {
        if (!phone || phone.length !== 10) return phone;
        return phone.substring(0, 3) + '-' + phone.substring(3);
    }

    return ACP;
});
