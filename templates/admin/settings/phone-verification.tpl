<div class="acp-page-container">
    <div class="row">
        <div class="col-lg-12">
            
            <div class="panel panel-primary">
                <div class="panel-heading">
                    <h3 class="panel-title">
                        <i class="fa fa-cog"></i> הגדרות Call2All - אימות בצינתוק
                    </h3>
                </div>
                <div class="panel-body">
                    <form id="voice-settings-form">
                
                        <div class="form-group">
                            <label for="voiceServerEnabled">
                                <input type="checkbox" id="voiceServerEnabled" name="voiceServerEnabled" />
                                הפעל אימות בצינתוק
                            </label>
                            <p class="help-block">כאשר מופעל, התוסף ישלח צינתוק (שיחה מנותקת) למשתמש, שיצטרך לאמת את 4 הספרות האחרונות של המספר המתקשר.</p>
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
                                    <i class="fa fa-cogs"></i> הגדרות מתקדמות (API Endpoint)
                                </summary>
                                <div style="margin-top: 15px; padding-left: 10px; border-left: 3px solid #337ab7;">
                                    <div class="form-group">
                                        <label for="voiceServerUrl">כתובת ה-API (Endpoint)</label>
                                        <input type="text" class="form-control" id="voiceServerUrl" name="voiceServerUrl" 
                                               placeholder="https://www.call2all.co.il/ym/api/RunTzintuk" dir="ltr" />
                                        <p class="help-block">כתובת השרת אליו נשלחת בקשת הצינתוק.</p>
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
                    
                    <h4>בדיקת צינתוק</h4>
                    <div class="form-inline">
                        <div class="form-group">
                            <input type="text" class="form-control" id="test-phone" 
                                   placeholder="05X-XXXXXXX" dir="ltr" style="width: 150px;" />
                        </div>
                        <button type="button" class="btn btn-warning" id="test-call-btn">
                            <i class="fa fa-phone"></i> שלח צינתוק בדיקה
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