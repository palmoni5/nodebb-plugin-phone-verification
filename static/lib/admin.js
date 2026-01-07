'use strict';

/* globals $, config, app */

define('admin/plugins/phone-verification', [], function () {
    var ACP = {};
    
    // משתנים גלובליים ל-Pagination
    var currentPage = 1;
    var totalPages = 1;
    var itemsPerPage = 50;

    ACP.init = function () {
        loadSettings();
        loadUsers(1);
        
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
                    
                    // טעינת שדות קיימים
                    $('#voiceServerEnabled').prop('checked', settings.voiceServerEnabled);
                    if (settings.hasApiKey) {
                        $('#voiceServerApiKey').val('********');
                    }

                    // === שדות חדשים שהוספנו ===
                    $('#voiceServerUrl').val(settings.voiceServerUrl);
                    $('#blockUnverifiedUsers').prop('checked', settings.blockUnverifiedUsers);
                    $('#voiceTtsMode').val(settings.voiceTtsMode);
                    $('#voiceMessageTemplate').val(settings.voiceMessageTemplate);
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
                'x-csrf-token': config.csrf_token
            },
            data: {
                // שדות קיימים
                voiceServerEnabled: $('#voiceServerEnabled').is(':checked'),
                voiceServerApiKey: $('#voiceServerApiKey').val(),
                
                // === שדות חדשים לשמירה ===
                voiceServerUrl: $('#voiceServerUrl').val(),
                blockUnverifiedUsers: $('#blockUnverifiedUsers').is(':checked'),
                voiceTtsMode: $('#voiceTtsMode').val(),
                voiceMessageTemplate: $('#voiceMessageTemplate').val()
            },
            success: function (response) {
                if (response.success) {
                    $('#settings-status').show().delay(2000).fadeOut();
                } else {
                    app.alert({
                        title: 'שגיאה',
                        message: 'שגיאה בשמירת ההגדרות: ' + (response.message || response.error),
                        type: 'danger',
                        timeout: 5000
                    });
                }
                $btn.prop('disabled', false).html('<i class="fa fa-save"></i> שמור הגדרות');
            },
            error: function (xhr) {
                var msg = 'שגיאה בשמירת ההגדרות';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    msg += ': ' + xhr.responseJSON.message;
                }
                app.alert({
                    title: 'שגיאה',
                    message: msg,
                    type: 'danger',
                    timeout: 5000
                });
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
            headers: {
                'x-csrf-token': config.csrf_token
            },
            data: { phoneNumber: phone },
            success: function (response) {
                if (response.success) {
                    $status.html('<span class="text-success"><i class="fa fa-check"></i> ' + response.message + '</span>');
                } else {
                    $status.html('<span class="text-danger"><i class="fa fa-times"></i> ' + (response.message || response.error) + '</span>');
                }
                $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח שיחת בדיקה');
            },
            error: function () {
                $status.html('<span class="text-danger">שגיאה בשליחת השיחה</span>');
                $btn.prop('disabled', false).html('<i class="fa fa-phone"></i> שלח שיחת בדיקה');
            }
        });
    }
    
    function loadUsers(page) {
        page = page || 1;
        currentPage = page;
        
        $.ajax({
            url: config.relative_path + '/api/admin/plugins/phone-verification/users',
            method: 'GET',
            data: { page: page, perPage: itemsPerPage },
            success: function (response) {
                if (response.success) {
                    renderUsers(response.users);
                    updateStats(response.total, response.users);
                    totalPages = Math.ceil(response.total / itemsPerPage) || 1;
                    renderPagination();
                } else {
                    showTableError('שגיאה בטעינת הנתונים');
                }
            },
            error: function () {
                showTableError('שגיאה בטעינת הנתונים');
            }
        });
    }
    
    function renderPagination() {
        var $pagination = $('#users-pagination');
        $pagination.empty();
        
        if (totalPages <= 1) return;
        
        var prevDisabled = currentPage === 1 ? 'disabled' : '';
        $pagination.append('<li class="page-item ' + prevDisabled + '"><a class="page-link" href="#" data-page="' + (currentPage - 1) + '">&laquo; הקודם</a></li>');
        
        var startPage = Math.max(1, currentPage - 2);
        var endPage = Math.min(totalPages, currentPage + 2);
        
        for (var i = startPage; i <= endPage; i++) {
            var active = i === currentPage ? 'active' : '';
            $pagination.append('<li class="page-item ' + active + '"><a class="page-link" href="#" data-page="' + i + '">' + i + '</a></li>');
        }
        
        var nextDisabled = currentPage === totalPages ? 'disabled' : '';
        $pagination.append('<li class="page-item ' + nextDisabled + '"><a class="page-link" href="#" data-page="' + (currentPage + 1) + '">הבא &raquo;</a></li>');
        
        $pagination.find('a').off('click').on('click', function(e) {
            e.preventDefault();
            var page = $(this).data('page');
            if (page > 0 && page <= totalPages && page !== currentPage) {
                loadUsers(page);
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
                '<td><a href="' + config.relative_path + '/admin/manage/users/' + user.uid + '">' + user.uid + ' (' + user.username + ')</a></td>' +
                '<td dir="ltr">' + formatPhone(user.phone) + '</td>' +
                '<td>' + verifiedDate + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '</tr>';
            
            $tbody.append(row);
        });
    }
    
    function updateStats(total, users) {
        $('#total-users').text(total || users.length);
        var verified = users.filter(function (u) { return u.phoneVerified; }).length;
        // הערה: הסטטיסטיקה כאן חלקית כי היא מבוססת רק על העמוד הנוכחי, 
        // בגרסה מתקדמת כדאי להביא סטטיסטיקה מהשרת.
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
                            'מזהה: <a href="' + config.relative_path + '/admin/manage/users/' + user.uid + '">' + user.uid + ' (' + user.username + ')</a><br>' +
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
