'use strict';


define('admin/plugins/phone-verification', ['settings', 'bootbox', 'alerts'], function(Settings, bootbox, alerts) {
	var ACP = {};

	ACP.init = function() {
		var usersTbody = $('#users-tbody');
		var paginationUl = $('#users-pagination');
		var currentPage = 1;

		Settings.load('phone-verification', $('#voice-settings-form'));

		function buildApiLink() {
			var base = window.location.origin || '';
			return base + config.relative_path + '/api/phone-verification/inbound-call';
		}

		function buildUserCallConfig(token) {
			var apiLink = buildApiLink();
			return [
				'type=api',
				'api_link=' + apiLink,
				'api_hangup_send=no',
				'api_add_0=token=' + token
			].join('\n');
		}

		function showUserCallSetupModal(token, onConfirm) {
			var configText = buildUserCallConfig(token);
			var modalHtml =
				'<div>' +
					'<p>לשם ביצוע הפעולה יש להגדיר בקו שלכם בהגדרות השלוחה הראשית או השלוחה הרצויה לאימות את ההגדרות הבאות:</p>' +
					'<div class="mb-2">' +
						'<button type="button" class="btn btn-default btn-sm" id="copy-user-call-config">העתק</button>' +
					'</div>' +
					'<pre style="white-space: pre-wrap;"><code id="user-call-config">' + configText + '</code></pre>' +
				'</div>';

			var dialog = bootbox.dialog({
				title: 'הגדרת שיחה יזומה',
				message: modalHtml,
				buttons: {
					cancel: {
						label: 'ביטול',
						className: 'btn-ghost',
						callback: function() {
							if (typeof onConfirm === 'function') onConfirm(false);
						}
					},
					ok: {
						label: 'הגדרתי את הקו שיעביר להמשך',
						className: 'btn-primary',
						callback: function() {
							if (typeof onConfirm === 'function') onConfirm(true);
						}
					}
				}
			});

			dialog.on('shown.bs.modal', function() {
				$('#copy-user-call-config').off('click').on('click', function() {
					var text = $('#user-call-config').text();
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(text).then(function() {
							alerts.success('הועתק ללוח');
						}).catch(function() {
							alerts.error('לא ניתן להעתיק');
						});
					} else {
						var $temp = $('<textarea>').val(text).appendTo('body').select();
						try {
							document.execCommand('copy');
							alerts.success('הועתק ללוח');
						} catch (e) {
							alerts.error('לא ניתן להעתיק');
						}
						$temp.remove();
					}
				});
			});
		}

		$('#save-settings-btn').on('click', function(e) {
			e.preventDefault();
			Settings.save('phone-verification', $('#voice-settings-form'), function() {
				alerts.success('ההגדרות נשמרו בהצלחה!');
			});
		});

		$('#userCallEnabled').on('change', function() {
			var $checkbox = $(this);
			if (!$checkbox.is(':checked')) return;

			var token = $('#callApiToken').val();
			if (!token) {
				$.post(config.relative_path + '/api/admin/plugins/phone-verification/refresh-token', { _csrf: config.csrf_token }, function(res) {
					if (res && res.success && res.token) {
						$('#callApiToken').val(res.token);
						showUserCallSetupModal(res.token, function(confirmed) {
							if (!confirmed) {
								$checkbox.prop('checked', false);
							}
						});
					} else {
						alerts.error('שגיאה ביצירת טוקן');
						$checkbox.prop('checked', false);
					}
				});
				return;
			}

			showUserCallSetupModal(token, function(confirmed) {
				if (!confirmed) {
					$checkbox.prop('checked', false);
				}
			});
		});

		$('#refresh-call-token-btn').on('click', function() {
			bootbox.confirm({
				title: 'רענון טוקן',
				message: 'אחרי הרענון יש לעדכן את הגדרות השלוחה בקו. האם להמשיך?',
				callback: function(result) {
					if (!result) return;
					$.post(config.relative_path + '/api/admin/plugins/phone-verification/refresh-token', { _csrf: config.csrf_token }, function(res) {
						if (res && res.success && res.token) {
							$('#callApiToken').val(res.token);
							alerts.success('הטוקן עודכן');
						} else {
							alerts.error('שגיאה ברענון הטוקן');
						}
					});
				}
			});
		});


		function renderPagination(curr, total) {
			currentPage = curr;
			paginationUl.empty();
			if(total <= 1) return;
			for(var i=1; i<=total; i++) {
				var active = i === curr ? 'active' : '';
				paginationUl.append('<li class="' + active + '"><a href="#" class="page-link" data-page="' + i + '">' + i + '</a></li>');
			}
		}

		function buildUserRow(user) {
			var displayName = user.username || ('משתמש ' + user.uid);
			var safeName = $('<div>').text(displayName).html(); 
			var userLink = config.relative_path + '/admin/manage/users?searchBy=uid&query=' + user.uid + '&page=1&sortBy=lastonline';
			
			var statusBadge = user.phoneVerified ? '<span class="label label-success">מאומת</span>' : '<span class="label label-warning">ממתין</span>';
			
			var safePhone = user.phone ? $('<div>').text(user.phone).html() : '<span class="text-muted">-- ללא --</span>';
			var dateStr = user.phoneVerifiedAt ? new Date(user.phoneVerifiedAt).toLocaleDateString('he-IL') : '-';

			var btnVerify = '<button class="btn btn-xs btn-success verify-user-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="אמת"><i class="fa fa-check"></i></button>';
			var btnUnverify = '<button class="btn btn-xs btn-warning unverify-user-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="בטל"><i class="fa fa-ban"></i></button>';
			var btnDelete = '<button class="btn btn-xs btn-danger delete-phone-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="מחק"><i class="fa fa-trash"></i></button>';

			var actionBtn = user.phoneVerified ? btnUnverify : btnVerify;

			return '<tr>' +
				'<td>' + user.uid + '</td>' +
				'<td><a href="' + userLink + '" target="_blank"><strong>' + safeName + '</strong></a></td>' +
				'<td dir="ltr">' + safePhone + '</td>' +
				'<td>' + dateStr + '</td>' +
				'<td>' + statusBadge + '</td>' +
				'<td class="text-right"><div class="btn-group">' + actionBtn + btnDelete + '</div></td>' +
			'</tr>';
		}

		function loadUsers(page) {
			page = page || 1;
			usersTbody.html('<tr><td colspan="6" class="text-center"><i class="fa fa-spinner fa-spin"></i> טוען נתונים...</td></tr>');
			
			$.get(config.relative_path + '/api/admin/plugins/phone-verification/users', { page: page }, function(data) {
				if (!data || !data.success) {
					usersTbody.html('<tr><td colspan="6" class="text-center text-danger">שגיאה בטעינת נתונים</td></tr>');
					return;
				}
				if (data.users.length === 0) {
					usersTbody.html('<tr><td colspan="6" class="text-center">אין משתמשים להצגה</td></tr>');
					return;
				}
				usersTbody.empty();
				data.users.forEach(function(user) { usersTbody.append(buildUserRow(user)); });
				$('#total-users').text(data.total); 
				renderPagination(data.page, data.totalPages);
			});
		}

		loadUsers(1);


		paginationUl.on('click', 'a.page-link', function(e) {
			e.preventDefault();
			loadUsers($(this).data('page'));
		});

		$('#btn-add-manual-user').on('click', function() {
			bootbox.prompt("הזן את <b>שם המשתמש</b> שברצונך להוסיף לרשימת המאומתים:", function(username) {
				if (!username) return;

				socket.emit('plugins.call2all.getUidByUsername', { username: username }, function(err, uid) {
					if (err) return alerts.error(err.message || 'משתמש לא נמצא');

					bootbox.prompt({
						title: "הזן מספר טלפון עבור " + username + " (אופציונלי)",
						inputType: 'text',
						callback: function(phone) {
							if (phone === null) return;

							var confirmMsg = "<h4>סיכום פעולה</h4>" +
											 "<b>שם משתמש:</b> " + username + "<br/>" +
											 "<b>מספר טלפון:</b> " + (phone ? phone : "ללא מספר (יוגדר כמאומת)") + "<br/><br/>" +
											 "האם אתה בטוח שברצונך להמשיך?";

							bootbox.confirm(confirmMsg, function(result) {
								if (result) {
									socket.emit('plugins.call2all.adminAddVerifiedUser', { uid: uid, phone: phone }, function(err) {
										if (err) return alerts.error(err.message);
										alerts.success('המשתמש ' + username + ' הוגדר כמאומת בהצלחה!');
										loadUsers(1);
									});
								}
							});
						}
					});
				});
			});
		});

		$('#test-call-btn').on('click', function() {
			var phone = $('#test-phone').val();
			if(!phone) return alerts.error('נא להזין מספר לבדיקה');
			
			$.post(config.relative_path + '/api/admin/plugins/phone-verification/test-call', { phoneNumber: phone, _csrf: config.csrf_token }, function(res) {
				if(res.success) {
                    // עדכון: הצגת הקוד שהתקבל מהשרת למנהל
                    var msg = res.message || 'הצינתוק יצא בהצלחה';
                    if (res.code) {
                        msg += '<br><strong>קוד צפוי (4 ספרות אחרונות): ' + res.code + '</strong>';
                    }
                    alerts.success(msg);
                }
				else alerts.error(res.message || 'שגיאה בביצוע הבדיקה');
			});
		});

		$('#users-table').on('click', '.verify-user-btn', function() {
			var uid = $(this).data('uid');
			var name = $(this).data('name');
			bootbox.confirm("האם לאמת ידנית את " + name + "?", function(res) {
				if(res) socket.emit('plugins.call2all.adminVerifyUser', { uid: uid }, function(err) {
					if(err) return alerts.error(err.message);
					alerts.success('המשתמש ' + name + ' אומת!');
					loadUsers(currentPage);
				});
			});
		});

		$('#users-table').on('click', '.unverify-user-btn', function() {
			var uid = $(this).data('uid');
			var name = $(this).data('name');
			bootbox.confirm("האם לבטל את האימות ל-" + name + "?", function(res) {
				if(res) socket.emit('plugins.call2all.adminUnverifyUser', { uid: uid }, function(err) {
					if(err) return alerts.error(err.message);
					alerts.success('האימות בוטל!');
					loadUsers(currentPage);
				});
			});
		});

		$('#users-table').on('click', '.delete-phone-btn', function() {
			var uid = $(this).data('uid');
			var name = $(this).data('name');
			bootbox.confirm("האם למחוק את הטלפון של " + name + "?", function(res) {
				if(res) socket.emit('plugins.call2all.adminDeleteUserPhone', { uid: uid }, function(err) {
					if(err) return alerts.error(err.message);
					alerts.success('נמחק!');
					loadUsers(currentPage);
				});
			});
		});

		$('#search-btn').on('click', function() {
			var phone = $('#phone-search').val();
			if (!phone) { loadUsers(1); return; }
			$.get(config.relative_path + '/api/admin/plugins/phone-verification/search', { phone: phone }, function(data) {
				usersTbody.empty();
				if (data.success && data.found) usersTbody.append(buildUserRow(data.user));
				else usersTbody.html('<tr><td colspan="6" class="text-center">לא נמצא משתמש</td></tr>');
			});
		});
	};

	return ACP;
});
