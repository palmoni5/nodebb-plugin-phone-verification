<div class="acp-page-container">
    <div class="row">
        <div class="col-lg-12">
            
            <div class="panel panel-primary">
                <div class="panel-heading">
                    <h3 class="panel-title">
                        <i class="fa fa-cog"></i> הגדרות Call2All - שיחות קוליות
                    </h3>
                </div>
                <div class="panel-body">
                    <form id="voice-settings-form">
                        <div class="form-group">
                            <label for="voiceServerEnabled">
                                <input type="checkbox" id="voiceServerEnabled" name="voiceServerEnabled" />
                                הפעל שיחות קוליות
                            </label>
                            <p class="help-block">כאשר מופעל, התוסף ישלח שיחה קולית עם קוד האימות דרך Call2All</p>
                        </div>
                        
                        <div class="form-group">
                            <label for="voiceServerApiKey">Token של Call2All</label>
                            <input type="password" class="form-control" id="voiceServerApiKey" name="voiceServerApiKey" 
                                   placeholder="WU1BUElL.apik_xxxxx..." dir="ltr" />
                            <p class="help-block">ה-Token שקיבלת מ-Call2All (מתחיל ב-WU1BUElL)</p>
                        </div>

                        <div class="form-group">
                            <details style="border: 1px solid #ddd; padding: 10px; border-radius: 4px; background-color: #f9f9f9;">
                                <summary style="cursor: pointer; font-weight: bold; color: #337ab7; outline: none;">
                                    <i class="fa fa-cogs"></i> הגדרות מתקדמות (עריכת פרמטרים ותוכן ההודעה)
                                </summary>
                                <div style="margin-top: 15px; padding-left: 10px; border-left: 3px solid #337ab7;">
                                    <div class="form-group">
                                        <label for="voiceServerUrl">כתובת ה-API (Endpoint)</label>
                                        <input type="text" class="form-control" id="voiceServerUrl" name="voiceServerUrl" 
                                               placeholder="https://www.call2all.co.il/ym/api/RunCampaign" dir="ltr" />
                                        <p class="help-block">כתובת השרת אליו נשלחת הבקשה.</p>
                                    </div>
                                    <div class="form-group">
                                        <label for="voiceTtsMode">מצב ה-TTS (ttsMode)</label>
                                        <input type="text" class="form-control" id="voiceTtsMode" name="voiceTtsMode" 
                                               placeholder="1" dir="ltr" />
                                        <p class="help-block">ערך הפרמטר <code>ttsMode</code> הנשלח ל-API (ברירת מחדל: 1).</p>
                                    </div>
                                    <div class="form-group">
                                        <label for="voiceMessageTemplate">תוכן ההודעה (Template)</label>
                                        <textarea class="form-control" id="voiceMessageTemplate" name="voiceMessageTemplate" rows="3" dir="rtl"></textarea>
                                        <p class="help-block">
                                            הטקסט שיוקרא למשתמש.<br/>
                                            Placeholders חובה: <code>{code}</code> (הקוד), <code>{siteTitle}</code> (שם האתר)
                                        </p>
                                    </div>
                                </div>
                            </details>
                        </div>
                        <hr />

                        <div class="form-group">
                            <div class="checkbox">
                                <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
                                    <input type="checkbox" class="mdl-switch__input" id="blockUnverifiedUsers" name="blockUnverifiedUsers">
                                    <span class="mdl-switch__label"><strong>חסום כתיבה למשתמשים לא מאומתים</strong></span>
                                </label>
                            </div>
                            <p class="help-block">
                                אם מופעל, משתמשים רשומים שלא אימתו את הטלפון שלהם לא יוכלו לפתוח נושאים חדשים או להגיב.
                            </p>
                        </div>

                        <div class="form-group">
                            <button type="submit" class="btn btn-primary" id="save-settings-btn">
                                <i class="fa fa-save"></i> שמור הגדרות
                            </button>
                            <span id="settings-status" class="text-success" style="margin-right: 10px; display: none;">
                                <i class="fa fa-check"></i> נשמר!
                            </span>
                        </div>
                    </form>
                    
                    <hr />
                    
                    <h4>בדיקת שיחה</h4>
                    <div class="form-inline">
                        <div class="form-group">
                            <input type="text" class="form-control" id="test-phone" 
                                   placeholder="05X-XXXXXXX" dir="ltr" style="width: 150px;" />
                        </div>
                        <button type="button" class="btn btn-warning" id="test-call-btn">
                            <i class="fa fa-phone"></i> שלח שיחת בדיקה
                        </button>
                        <span id="test-status" style="margin-right: 10px;"></span>
                    </div>
                </div>
            </div>
            
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fa fa-phone"></i> ניהול אימות טלפון</h3>
                </div>
                <div class="panel-body">
                    
                    <div class="well">
                        <div class="row">
                            <div class="col-md-6">
                                <h4>חיפוש משתמש לפי מספר טלפון</h4>
                                <div class="form-group">
                                    <div class="input-group">
                                        <input type="text" class="form-control" id="phone-search" placeholder="הזן מספר טלפון" dir="ltr">
                                        <span class="input-group-btn">
                                            <button class="btn btn-primary" type="button" id="search-btn"><i class="fa fa-search"></i> חפש</button>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6 text-left" style="padding-top: 35px;">
                                <button class="btn btn-success" id="btn-add-manual-user">
                                    <i class="fa fa-plus"></i> הוסף משתמש מאומת ידנית
                                </button>
                            </div>
                        </div>
                        <div id="search-result" style="display:none;"><div class="alert" id="search-alert"></div></div>
                    </div>
                    
                    <div class="row" style="margin-bottom: 20px;">
                        <div class="col-md-4">
                            <div class="panel panel-info">
                                <div class="panel-heading"><h4 class="panel-title">סה"כ משתמשים עם טלפון</h4></div>
                                <div class="panel-body text-center"><h2 id="total-users">0</h2></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="panel panel-success">
                                <div class="panel-heading"><h4 class="panel-title">משתמשים מאומתים</h4></div>
                                <div class="panel-body text-center"><h2 id="verified-count">0</h2></div>
                            </div>
                        </div>
                    </div>
                    
                    <h4>רשימת משתמשים</h4>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover" id="users-table">
                            <thead>
                                <tr>
                                    <th>מזהה (UID)</th>
                                    <th>שם משתמש</th>
                                    <th>מספר טלפון</th>
                                    <th>תאריך אימות</th>
                                    <th>סטטוס</th>
                                    <th class="text-right">פעולות לניהול</th>
                                </tr>
                            </thead>
                            <tbody id="users-tbody">
                                <tr><td colspan="6" class="text-center">טוען...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <nav aria-label="ניווט עמודים" class="text-center"><ul class="pagination" id="users-pagination"></ul></nav>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
require(['settings', 'admin/modules/selectable', 'bootbox'], function(Settings, Selectable, bootbox) {
    
    // --- הוספת משתמש ידנית ---
    $('#btn-add-manual-user').on('click', function() {
        bootbox.prompt("הזן את <b>שם המשתמש</b> שברצונך להוסיף לרשימת המאומתים:", function(username) {
            if (!username) return;

            // המרת שם משתמש ל-UID
            socket.emit('user.getUidByUsersname', username, function(err, uid) {
                if (err || !uid) {
                    return app.alertError('משתמש בשם "' + username + '" לא נמצא במערכת.');
                }

                // בקשת מספר טלפון (אופציונלי)
                bootbox.prompt({
                    title: "הזן מספר טלפון עבור " + username + " (אופציונלי)",
                    message: "<small>השאר ריק אם ברצונך לאמת את המשתמש ללא מספר טלפון</small>",
                    inputType: 'text',
                    callback: function(phone) {
                        // יצירת הודעת אישור מסכמת
                        var confirmMsg = "<h4>סיכום פעולה</h4>" +
                                         "<b>שם משתמש:</b> " + username + "<br/>" +
                                         "<b>מספר טלפון:</b> " + (phone ? phone : "ללא מספר (יוגדר כמאומת)") + "<br/><br/>" +
                                         "האם אתה בטוח שברצונך להמשיך?";

                        bootbox.confirm(confirmMsg, function(result) {
                            if (result) {
                                socket.emit('plugins.call2all.adminAddVerifiedUser', { uid: uid, phone: phone }, function(err) {
                                    if (err) return app.alertError(err.message);
                                    app.alertSuccess('המשתמש ' + username + ' הוגדר כמאומת בהצלחה!');
                                    ajaxify.refresh(); 
                                });
                            }
                        });
                    }
                });
            });
        });
    });

    // --- בניית שורות הטבלה ---
    window.buildUserRow = function(user) {
        // הכנה של שם המשתמש לתצוגה ולהודעות
        // אנו מניחים שהשרת מחזיר user.username, אם לא - משתמשים ב-UID
        var displayName = user.username || ('משתמש ' + user.uid);
        var safeName = displayName.replace(/"/g, '&quot;'); // מניעת שבירת HTML

        var userLink = '/admin/manage/users?searchBy=uid&query=' + user.uid + '&page=1&sortBy=lastonline';
        
        var statusBadge = user.verified 
            ? '<span class="label label-success">מאומת</span>' 
            : '<span class="label label-warning">ממתין לאימות</span>';

        var actionsHtml = '<div class="btn-group pull-right">';
        
        // כפתור אימות / ביטול אימות
        if (!user.verified) {
             actionsHtml += '<button class="btn btn-xs btn-success verify-user-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="אמת ידנית"><i class="fa fa-check"></i></button>';
        } else {
             actionsHtml += '<button class="btn btn-xs btn-warning unverify-user-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="בטל אימות"><i class="fa fa-ban"></i></button>';
        }
        
        // כפתור מחיקה
        actionsHtml += '<button class="btn btn-xs btn-danger delete-phone-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="מחק טלפון"><i class="fa fa-trash"></i></button>';
        actionsHtml += '</div>';

        // תצוגת טלפון
        var displayPhone = user.phone ? user.phone : '<span class="text-muted">-- ללא --</span>';

        return '<tr>' +
            '<td>' + user.uid + '</td>' +
            '<td><a href="' + userLink + '" target="_blank"><strong>' + displayName + '</strong></a></td>' +
            '<td dir="ltr">' + displayPhone + '</td>' +
            '<td>' + (user.verifiedAt ? new Date(user.verifiedAt).toLocaleString() : '-') + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + actionsHtml + '</td>' +
        '</tr>';
    };

    // --- לוגיקת כפתורים בטבלה ---

    // 1. אימות ידני (למשתמש קיים בטבלה שאינו מאומת)
    $('body').on('click', '.verify-user-btn', function() {
        var uid = $(this).data('uid');
        var name = $(this).data('name');
        
        var msg = "האם אתה בטוח שברצונך לאמת ידנית את המשתמש <b>" + name + "</b>?<br>הוא יסומן כמאומת באופן מיידי.";
        
        bootbox.confirm(msg, function(result) {
            if (result) {
                socket.emit('plugins.call2all.adminVerifyUser', { uid: uid }, function(err) {
                    if (err) return app.alertError(err.message);
                    app.alertSuccess('המשתמש ' + name + ' אומת!');
                    ajaxify.refresh();
                });
            }
        });
    });

    // 2. ביטול אימות
    $('body').on('click', '.unverify-user-btn', function() {
        var uid = $(this).data('uid');
        var name = $(this).data('name');
        
        var msg = "האם אתה בטוח שברצונך <b>לבטל את האימות</b> עבור המשתמש <b>" + name + "</b>?<br>המשתמש יהפוך ל'לא מאומת'.";

        bootbox.confirm(msg, function(result) {
            if (result) {
                socket.emit('plugins.call2all.adminUnverifyUser', { uid: uid }, function(err) {
                    if (err) return app.alertError(err.message);
                    app.alertSuccess('האימות של ' + name + ' בוטל!');
                    ajaxify.refresh();
                });
            }
        });
    });

    // 3. מחיקת טלפון (הסרה מהרשימה)
    $('body').on('click', '.delete-phone-btn', function() {
        var uid = $(this).data('uid');
        var name = $(this).data('name');
        
        var msg = "<h4>אזהרה</h4>האם אתה בטוח שברצונך <b>למחוק את רשומת הטלפון</b> של המשתמש <b>" + name + "</b>?<br/>פעולה זו תסיר אותו לחלוטין מהרשימה.";

        bootbox.confirm(msg, function(result) {
            if (result) {
                socket.emit('plugins.call2all.adminDeleteUserPhone', { uid: uid }, function(err) {
                    if (err) return app.alertError(err.message);
                    app.alertSuccess('המשתמש ' + name + ' הוסר מהרשימה בהצלחה!');
                    ajaxify.refresh();
                });
            }
        });
    });
});
</script>