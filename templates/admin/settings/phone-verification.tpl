<div class="acp-page-container">
    <div class="row">
        <div class="col-lg-12">
            
            <!-- הגדרות Call2All -->
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
                    <p class="help-block">שולח שיחה עם קוד בדיקה (1, 2, 3, 4, 5, 6) למספר שהוזן</p>
                </div>
            </div>
            
            <!-- ניהול משתמשים -->
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">
                        <i class="fa fa-phone"></i> ניהול אימות טלפון
                    </h3>
                </div>
                <div class="panel-body">
                    
                    <!-- חיפוש -->
                    <div class="well">
                        <h4>חיפוש משתמש לפי מספר טלפון</h4>
                        <div class="form-group">
                            <div class="input-group">
                                <input type="text" class="form-control" id="phone-search" 
                                       placeholder="הזן מספר טלפון (למשל: 0501234567)" dir="ltr">
                                <span class="input-group-btn">
                                    <button class="btn btn-primary" type="button" id="search-btn">
                                        <i class="fa fa-search"></i> חפש
                                    </button>
                                </span>
                            </div>
                        </div>
                        <div id="search-result" style="display:none;">
                            <div class="alert" id="search-alert"></div>
                        </div>
                    </div>
                    
                    <!-- סטטיסטיקות -->
                    <div class="row" style="margin-bottom: 20px;">
                        <div class="col-md-4">
                            <div class="panel panel-info">
                                <div class="panel-heading">
                                    <h4 class="panel-title">סה"כ משתמשים עם טלפון</h4>
                                </div>
                                <div class="panel-body text-center">
                                    <h2 id="total-users">0</h2>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="panel panel-success">
                                <div class="panel-heading">
                                    <h4 class="panel-title">טלפונים מאומתים</h4>
                                </div>
                                <div class="panel-body text-center">
                                    <h2 id="verified-count">0</h2>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- טבלת משתמשים -->
                    <h4>רשימת משתמשים</h4>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover" id="users-table">
                            <thead>
                                <tr>
                                    <th>מזהה משתמש</th>
                                    <th>מספר טלפון</th>
                                    <th>תאריך אימות</th>
                                    <th>סטטוס</th>
                                </tr>
                            </thead>
                            <tbody id="users-tbody">
                                <tr>
                                    <td colspan="4" class="text-center">
                                        <i class="fa fa-spinner fa-spin"></i> טוען...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                </div>
            </div>
        </div>
    </div>
</div>
