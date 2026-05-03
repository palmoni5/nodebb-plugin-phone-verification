<div class="acp-page-container">
    <div class="row">
        <div class="col-lg-12">
            
            <div class="panel panel-primary">
                <div class="panel-heading">
                    <h3 class="panel-title">
                        <i class="fa fa-cog"></i> [[phone-verification:admin.call2all-title]]
                    </h3>
                </div>
                <div class="panel-body">
                    <form id="voice-settings-form">
                
                        <div class="form-group">
                            <label for="voiceServerEnabled">
                                <input type="checkbox" id="voiceServerEnabled" name="voiceServerEnabled" />
                                [[phone-verification:admin.tzintuk-mode]]
                            </label>
                            <p class="help-block">[[phone-verification:admin.tzintuk-help]]</p>
                        </div>

                        <div class="form-group">
                            <label for="userCallEnabled">
                                <input type="checkbox" id="userCallEnabled" name="userCallEnabled" />
                                [[phone-verification:admin.user-call-mode]]
                            </label>
                            <p class="help-block">[[phone-verification:admin.user-call-help]]</p>
                        </div>

                        <div class="form-group">
                            <label for="userCallNumber">[[phone-verification:admin.user-call-number]]</label>
                            <input type="text" class="form-control" id="userCallNumber" name="userCallNumber"
                                   placeholder="[[phone-verification:admin.user-call-number-placeholder]]" dir="ltr" />
                        </div>

                        <div class="form-group">
                            <label for="callApiToken">[[phone-verification:admin.call-token]]</label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="callApiToken" name="callApiToken" readonly dir="ltr" />
                                <span class="input-group-btn">
                                    <button type="button" class="btn btn-default" id="refresh-call-token-btn">
                                        <i class="fa fa-refresh"></i> [[phone-verification:admin.refresh-token]]
                                    </button>
                                </span>
                            </div>
                            <p class="help-block">[[phone-verification:admin.call-token-help]]</p>
                        </div>
                        
                        <div class="form-group">
                            <label for="voiceServerApiKey">[[phone-verification:admin.call2all-token]]</label>
                            <input type="password" class="form-control" id="voiceServerApiKey" name="voiceServerApiKey" 
                                   placeholder="WU1BUElL.apik_xxxxx..." dir="ltr" />
                            <p class="help-block">[[phone-verification:admin.call2all-token-help]]</p>
                        </div>

                        <div class="form-group">
                            <details style="border: 1px solid #ddd; padding: 10px; border-radius: 4px; background-color: #f9f9f9;">
                                <summary style="cursor: pointer; font-weight: bold; color: #337ab7; outline: none;">
                                    <i class="fa fa-cogs"></i> [[phone-verification:admin.advanced-settings]]
                                </summary>
                                <div style="margin-top: 15px; padding-left: 10px; border-left: 3px solid #337ab7;">
                                    <div class="form-group">
                                        <label for="voiceServerUrl">[[phone-verification:admin.api-endpoint]]</label>
                                        <input type="text" class="form-control" id="voiceServerUrl" name="voiceServerUrl" 
                                               placeholder="https://www.call2all.co.il/ym/api/RunTzintuk" dir="ltr" />
                                        <p class="help-block">[[phone-verification:admin.api-endpoint-help]]</p>
                                    </div>
                                    </div>
                            </details>
                        </div>
                        <hr />

                        <div class="form-group">
                            <div class="checkbox">
                                <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
                                    <input type="checkbox" class="mdl-switch__input" id="blockUnverifiedUsers" name="blockUnverifiedUsers">
                                    <span class="mdl-switch__label"><strong>[[phone-verification:admin.block-unverified]]</strong></span>
                                </label>
                            </div>
                            <p class="help-block">
                                [[phone-verification:admin.block-unverified-help]]
                            </p>
                        </div>

                        <div class="form-group">
                            <button type="submit" class="btn btn-primary" id="save-settings-btn">
                                <i class="fa fa-save"></i> [[phone-verification:admin.save-settings]]
                            </button>
                            <span id="settings-status" class="text-success" style="margin-right: 10px; display: none;">
                                <i class="fa fa-check"></i> [[phone-verification:admin.saved]]
                            </span>
                        </div>
                    </form>
                    
                    <hr />
                    
                    <div class="row">
                        <div class="col-md-6">
                            <h4>[[phone-verification:admin.test-tzintuk]]</h4>
                            <div class="form-inline">
                                <div class="form-group">
                                    <input type="text" class="form-control" id="test-phone" 
                                           placeholder="05X-XXXXXXX" dir="ltr" style="width: 150px;" />
                                </div>
                                <button type="button" class="btn btn-warning" id="test-call-btn">
                                    <i class="fa fa-phone"></i> [[phone-verification:admin.send-test-tzintuk]]
                                </button>
                                <span id="test-status" style="margin-right: 10px;"></span>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h4>[[phone-verification:admin.test-user-call]]</h4>
                            <div class="form-inline">
                                <div class="form-group">
                                    <input type="text" class="form-control" id="test-user-call-phone" 
                                           placeholder="05X-XXXXXXX" dir="ltr" style="width: 150px;" />
                                </div>
                                <button type="button" class="btn btn-info" id="test-user-call-btn">
                                    <i class="fa fa-phone-square"></i> [[phone-verification:admin.run-user-call-test]]
                                </button>
                                <span id="test-user-call-status" style="margin-right: 10px;"></span>
                            </div>
                            <p class="help-block" style="font-size: 12px; margin-top: 5px;">
                                [[phone-verification:admin.user-call-test-help]]
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fa fa-phone"></i> [[phone-verification:admin.management-title]]</h3>
                </div>
                <div class="panel-body">
                    
                    <div class="well">
                        <div class="row">
                            <div class="col-md-6">
                                <h4>[[phone-verification:admin.search-by-phone]]</h4>
                                <div class="form-group">
                                    <div class="input-group">
                                        <input type="text" class="form-control" id="phone-search" placeholder="[[phone-verification:admin.enter-phone]]" dir="ltr">
                                        <span class="input-group-btn">
                                            <button class="btn btn-primary" type="button" id="search-btn"><i class="fa fa-search"></i> [[phone-verification:admin.search]]</button>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6 text-left" style="padding-top: 35px;">
                                <button class="btn btn-success" id="btn-add-manual-user">
                                    <i class="fa fa-plus"></i> [[phone-verification:admin.add-verified-user]]
                                </button>
                            </div>
                        </div>
                        <div id="search-result" style="display:none;"><div class="alert" id="search-alert"></div></div>
                    </div>
                    
                    <div class="row" style="margin-bottom: 20px;">
                        <div class="col-md-4">
                            <div class="panel panel-info">
                                <div class="panel-heading"><h4 class="panel-title">[[phone-verification:admin.total-users]]</h4></div>
                                <div class="panel-body text-center"><h2 id="total-users">0</h2></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="panel panel-success">
                                <div class="panel-heading"><h4 class="panel-title">[[phone-verification:admin.verified-users]]</h4></div>
                                <div class="panel-body text-center"><h2 id="verified-count">0</h2></div>
                            </div>
                        </div>
                    </div>
                    
                    <h4>[[phone-verification:admin.user-list]]</h4>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover" id="users-table">
                            <thead>
                                <tr>
                                    <th>[[phone-verification:admin.uid]]</th>
                                    <th>[[phone-verification:admin.username]]</th>
                                    <th>[[phone-verification:admin.phone-number]]</th>
                                    <th>[[phone-verification:admin.verification-date]]</th>
                                    <th>[[phone-verification:admin.status]]</th>
                                    <th class="text-right">[[phone-verification:admin.management-actions]]</th>
                                </tr>
                            </thead>
                            <tbody id="users-tbody">
                                <tr><td colspan="6" class="text-center">[[phone-verification:admin.loading]]</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <nav aria-label="[[phone-verification:admin.pagination]]" class="text-center"><ul class="pagination" id="users-pagination"></ul></nav>
                </div>
            </div>
        </div>
    </div>
</div>
