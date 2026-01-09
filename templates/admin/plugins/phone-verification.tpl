<div class="acp-page-container">
    <div class="row">
        <!-- Main Settings & Management Column -->
        <div class="col-lg-9 col-md-12">
            
            <!-- Settings Card -->
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fa fa-sliders"></i> הגדרות אימות וחיבור</h3>
                </div>
                <div class="panel-body">
                    <form id="voice-settings-form" class="form-horizontal">
                        
                        <!-- System Status Toggles -->
                        <div class="form-group">
                            <label class="col-md-3 control-label">סטטוס מערכת</label>
                            <div class="col-md-9">
                                <div class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
                                    <label class="mdl-switch__label" for="voiceServerEnabled">
                                        <strong>הפעל את שיחות האימות</strong>
                                    </label>
                                    <input type="checkbox" class="mdl-switch__input" id="voiceServerEnabled" name="voiceServerEnabled">
                                </div>
                                <p class="help-block">האם לשלוח שיחות קוליות בעת אימות טלפון.</p>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="col-md-3 control-label">אכיפה</label>
                            <div class="col-md-9">
                                <div class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
                                    <label class="mdl-switch__label" for="blockUnverifiedUsers">
                                        <strong>חסום כתיבה למשתמשים לא מאומתים</strong>
                                    </label>
                                    <input type="checkbox" class="mdl-switch__input" id="blockUnverifiedUsers" name="blockUnverifiedUsers">
                                </div>
                                <p class="help-block">משתמשים שלא אימתו טלפון לא יוכלו לפתוח נושאים או להגיב.</p>
                            </div>
                        </div>

                        <hr />

                        <!-- API Settings -->
                        <div class="form-group">
                            <label class="col-md-3 control-label" for="voiceServerApiKey">Call2All Token</label>
                            <div class="col-md-9">
                                <div class="input-group">
                                    <span class="input-group-addon"><i class="fa fa-key"></i></span>
                                    <input type="password" class="form-control" id="voiceServerApiKey" name="voiceServerApiKey" placeholder="WU1BUElL.apik_xxxxx..." dir="ltr">
                                </div>
                                <p class="help-block">המפתח (Token) שקיבלת משירות Call2All.</p>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="col-md-3 control-label" for="voiceMessageTemplate">תבנית הודעה</label>
                            <div class="col-md-9">
                                <textarea class="form-control" id="voiceMessageTemplate" name="voiceMessageTemplate" rows="3" dir="rtl"></textarea>
                                <p class="help-block">
                                    הטקסט שיוקרא. משתנים חובה: <code>{code}</code>, <code>{siteTitle}</code>
                                </p>
                            </div>
                        </div>

                        <!-- Advanced Settings Collapsible -->
                        <div class="form-group">
                            <label class="col-md-3 control-label">הגדרות מתקדמות</label>
                            <div class="col-md-9">
                                <button class="btn btn-default btn-xs" type="button" data-toggle="collapse" data-target="#advancedSettings" aria-expanded="false" aria-controls="advancedSettings">
                                    הצג טכני / API <i class="fa fa-caret-down"></i>
                                </button>
                                <div class="collapse" id="advancedSettings" style="margin-top: 15px;">
                                    <div class="well well-sm">
                                        <div class="form-group" style="margin-bottom: 5px;">
                                            <label class="col-md-12">API Endpoint URL</label>
                                            <div class="col-md-12">
                                                <input type="text" class="form-control input-sm" id="voiceServerUrl" name="voiceServerUrl" placeholder="https://..." dir="ltr">
                                            </div>
                                        </div>
                                        <div class="form-group" style="margin-bottom: 0;">
                                            <label class="col-md-12">TTS Mode Parameter</label>
                                            <div class="col-md-12">
                                                <input type="text" class="form-control input-sm" id="voiceTtsMode" name="voiceTtsMode" placeholder="1" dir="ltr" style="width: 100px;">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </form>
                </div>
            </div>

            <!-- User Management Card -->
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fa fa-users"></i> מאגר משתמשים ואימותים</h3>
                </div>
                <div class="panel-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="input-group">
                                <input type="text" class="form-control" id="phone-search" placeholder="חפש לפי טלפון (למשל 0501234567)..." dir="ltr">
                                <span class="input-group-btn">
                                    <button class="btn btn-default" type="button" id="search-btn"><i class="fa fa-search"></i> חפש</button>
                                </span>
                            </div>
                            <div id="search-result" style="margin-top: 10px; display: none;"></div>
                        </div>
                        <div class="col-md-6 text-left">
                           <button class="btn btn-success" id="btn-add-manual-user">
                                <i class="fa fa-plus-circle"></i> הוסף משתמש ידנית
                            </button>
                        </div>
                    </div>

                    <div class="table-responsive" style="margin-top: 20px;">
                        <table class="table table-striped table-hover" id="users-table">
                            <thead>
                                <tr>
                                    <th>UID</th>
                                    <th>משתמש</th>
                                    <th>טלפון</th>
                                    <th>תאריך אימות</th>
                                    <th>סטטוס</th>
                                    <th class="text-right">פעולות</th>
                                </tr>
                            </thead>
                            <tbody id="users-tbody">
                                <tr><td colspan="6" class="text-center text-muted">טוען נתונים...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="text-center">
                        <ul class="pagination" id="users-pagination" style="margin: 0;"></ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sidebar / Actions Column -->
        <div class="col-lg-3 col-md-12">
            
            <!-- Save Action -->
            <div class="panel panel-primary">
                <div class="panel-heading">שמירה</div>
                <div class="panel-body">
                    <button type="button" class="btn btn-primary btn-block btn-lg" id="save-settings-btn">
                        <i class="fa fa-save"></i> שמור הגדרות
                    </button>
                     <div id="settings-status" class="alert alert-success" style="display: none; margin-top: 10px; margin-bottom: 0; padding: 5px; text-align: center;">
                        <i class="fa fa-check"></i> נשמר!
                    </div>
                </div>
            </div>

            <!-- Test Utility -->
            <div class="panel panel-info">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fa fa-stethoscope"></i> בדיקת שירות</h3>
                </div>
                <div class="panel-body">
                    <label>נסה לשלוח שיחה אליך:</label>
                    <div class="input-group" style="margin-bottom: 10px;">
                        <input type="text" class="form-control" id="test-phone" placeholder="050xxxxxxx" dir="ltr">
                        <span class="input-group-btn">
                            <button class="btn btn-warning" type="button" id="test-call-btn">
                                <i class="fa fa-phone"></i>
                            </button>
                        </span>
                    </div>
                    <span id="test-status" class="help-block small"></span>
                </div>
            </div>

            <!-- Stats -->
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fa fa-bar-chart"></i> תמונת מצב</h3>
                </div>
                <ul class="list-group">
                    <li class="list-group-item">
                        <span class="badge" id="total-users">0</span>
                        משתמשים עם טלפון
                    </li>
                    <li class="list-group-item">
                        <span class="badge list-group-item-success" id="verified-count">0</span>
                        משתמשים מאומתים
                    </li>
                </ul>
            </div>
        </div>
    </div>
</div>
