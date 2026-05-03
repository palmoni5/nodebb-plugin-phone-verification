'use strict';


define('admin/plugins/phone-verification', ['settings', 'bootbox', 'alerts', 'translator'], function(Settings, bootbox, alerts, translator) {
	var ACP = {};

	function tr(str) {
		return translator.translate(str);
	}

	function tx(key) {
		var args = Array.prototype.slice.call(arguments, 1);
		return translator.compile.apply(translator, ['phone-verification:' + key].concat(args));
	}

	function successMessage(message) {
		tr(message).then(function (translated) {
			alerts.success(translated);
		});
	}

	function errorMessage(message) {
		tr(message).then(function (translated) {
			alerts.error(translated);
		});
	}

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
					'<p>[[phone-verification:admin.user-call-setup-help]]</p>' +
					'<div class="mb-2">' +
						'<button type="button" class="btn btn-default btn-sm" id="copy-user-call-config">[[phone-verification:action.copy]]</button>' +
					'</div>' +
					'<pre style="white-space: pre-wrap;"><code id="user-call-config">' + configText + '</code></pre>' +
				'</div>';

			var dialog = bootbox.dialog({
				title: '[[phone-verification:admin.user-call-setup-title]]',
				message: modalHtml,
				buttons: {
					cancel: {
						label: '[[phone-verification:action.cancel]]',
						className: 'btn-ghost',
						callback: function() {
							if (typeof onConfirm === 'function') onConfirm(false);
						}
					},
					ok: {
						label: '[[phone-verification:admin.user-call-setup-confirm]]',
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
							successMessage(tx('admin.copied-to-clipboard'));
						}).catch(function() {
							errorMessage(tx('admin.copy-failed'));
						});
					} else {
						var $temp = $('<textarea>').val(text).appendTo('body').select();
						try {
							document.execCommand('copy');
							successMessage(tx('admin.copied-to-clipboard'));
						} catch (e) {
							errorMessage(tx('admin.copy-failed'));
						}
						$temp.remove();
					}
				});
			});
		}

		$('#save-settings-btn').on('click', function(e) {
			e.preventDefault();
			Settings.save('phone-verification', $('#voice-settings-form'), function() {
				successMessage(tx('admin.settings-saved'));
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
						errorMessage(tx('admin.token-create-failed'));
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
				title: '[[phone-verification:admin.refresh-token-title]]',
				message: '[[phone-verification:admin.refresh-token-confirm]]',
				callback: function(result) {
					if (!result) return;
					$.post(config.relative_path + '/api/admin/plugins/phone-verification/refresh-token', { _csrf: config.csrf_token }, function(res) {
						if (res && res.success && res.token) {
							$('#callApiToken').val(res.token);
							successMessage(tx('admin.token-refreshed'));
						} else {
							errorMessage(tx('admin.token-refresh-failed'));
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
			var displayName = user.username || tx('admin.user-fallback', user.uid);
			var safeName = $('<div>').text(displayName).html(); 
			var userLink = config.relative_path + '/admin/manage/users?searchBy=uid&query=' + user.uid + '&page=1&sortBy=lastonline';
			
			var statusBadge = user.phoneVerified ? '<span class="label label-success">[[phone-verification:admin.status-verified]]</span>' : '<span class="label label-warning">[[phone-verification:admin.status-pending]]</span>';
			
			var safePhone = user.phone ? $('<div>').text(user.phone).html() : '<span class="text-muted">[[phone-verification:admin.none]]</span>';
			var dateStr = user.phoneVerifiedAt ? new Date(user.phoneVerifiedAt).toLocaleDateString('he-IL') : '-';

			var btnVerify = '<button class="btn btn-xs btn-success verify-user-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="[[phone-verification:action.verify]]"><i class="fa fa-check"></i></button>';
			var btnUnverify = '<button class="btn btn-xs btn-warning unverify-user-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="[[phone-verification:action.unverify]]"><i class="fa fa-ban"></i></button>';
			var btnDelete = '<button class="btn btn-xs btn-danger delete-phone-btn" data-uid="' + user.uid + '" data-name="' + safeName + '" title="[[phone-verification:action.delete]]"><i class="fa fa-trash"></i></button>';

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
			tr('<tr><td colspan="6" class="text-center"><i class="fa fa-spinner fa-spin"></i> [[phone-verification:admin.loading-data]]</td></tr>').then(function (translated) {
				usersTbody.html(translated);
			});
			
			$.get(config.relative_path + '/api/admin/plugins/phone-verification/users', { page: page }, function(data) {
				if (!data || !data.success) {
					tr('<tr><td colspan="6" class="text-center text-danger">[[phone-verification:admin.load-error]]</td></tr>').then(function (translated) {
						usersTbody.html(translated);
					});
					return;
				}
				if (data.users.length === 0) {
					tr('<tr><td colspan="6" class="text-center">[[phone-verification:admin.no-users]]</td></tr>').then(function (translated) {
						usersTbody.html(translated);
					});
					return;
				}
				usersTbody.empty();
				data.users.forEach(function(user) {
					tr(buildUserRow(user)).then(function (translated) {
						usersTbody.append(translated);
					});
				});
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
			bootbox.prompt(tx('admin.prompt-username'), function(username) {
				if (!username) return;

				socket.emit('plugins.call2all.getUidByUsername', { username: username }, function(err, uid) {
					if (err) return errorMessage(err.message || tx('prompt.user-not-found'));

					bootbox.prompt({
						title: tx('admin.prompt-phone-for-user', username),
						inputType: 'text',
						callback: function(phone) {
							if (phone === null) return;

							var confirmMsg = tx('admin.add-user-summary', username, phone ? phone : tx('admin.none-with-verified-note'));

							bootbox.confirm(confirmMsg, function(result) {
								if (result) {
									socket.emit('plugins.call2all.adminAddVerifiedUser', { uid: uid, phone: phone }, function(err) {
										if (err) return errorMessage(err.message);
										successMessage(tx('admin.user-verified-success', username));
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
			if(!phone) return errorMessage(tx('admin.enter-phone-for-test'));
			
			$.post(config.relative_path + '/api/admin/plugins/phone-verification/test-call', { phoneNumber: phone, _csrf: config.csrf_token }, function(res) {
				if(res.success) {
                    var msg = res.message || tx('admin.test-tzintuk-success');
                    if (res.code) {
                        msg += '<br><strong>' + tx('admin.expected-code', res.code) + '</strong>';
                    }
                    successMessage(msg);
                }
				else errorMessage(res.message || tx('admin.test-call-failed'));
			});
		});

		$('#test-user-call-btn').on('click', function() {
			var phone = $('#test-user-call-phone').val();
			if(!phone) return errorMessage(tx('admin.enter-phone-for-test'));
			
			$.post(config.relative_path + '/api/admin/plugins/phone-verification/test-user-call', { phoneNumber: phone, _csrf: config.csrf_token }, function(res) {
				if(res.success) {
					var msg = tx('admin.test-user-call-success');
					if (res.code) {
						msg += '<br><strong>' + tx('admin.verification-code-label', res.code) + '</strong>';
					}
					if (res.phoneNumber) {
						msg += '<br><strong>' + tx('admin.line-number-label', res.phoneNumber) + '</strong>';
					}
					successMessage(msg);
				}
				else errorMessage(res.message || tx('admin.create-code-failed'));
			});
		});

		$('#users-table').on('click', '.verify-user-btn', function() {
			var uid = $(this).data('uid');
			var name = $(this).data('name');
			bootbox.confirm(tx('admin.confirm-verify-user', name), function(res) {
				if(res) socket.emit('plugins.call2all.adminVerifyUser', { uid: uid }, function(err) {
					if(err) return errorMessage(err.message);
					successMessage(tx('admin.user-verified-now', name));
					loadUsers(currentPage);
				});
			});
		});

		$('#users-table').on('click', '.unverify-user-btn', function() {
			var uid = $(this).data('uid');
			var name = $(this).data('name');
			bootbox.confirm(tx('admin.confirm-unverify-user', name), function(res) {
				if(res) socket.emit('plugins.call2all.adminUnverifyUser', { uid: uid }, function(err) {
					if(err) return errorMessage(err.message);
					successMessage(tx('admin.unverified-success'));
					loadUsers(currentPage);
				});
			});
		});

		$('#users-table').on('click', '.delete-phone-btn', function() {
			var uid = $(this).data('uid');
			var name = $(this).data('name');
			bootbox.confirm(tx('admin.confirm-delete-phone', name), function(res) {
				if(res) socket.emit('plugins.call2all.adminDeleteUserPhone', { uid: uid }, function(err) {
					if(err) return errorMessage(err.message);
					successMessage(tx('admin.deleted-success'));
					loadUsers(currentPage);
				});
			});
		});

		$('#search-btn').on('click', function() {
			var phone = $('#phone-search').val();
			if (!phone) { loadUsers(1); return; }
			$.get(config.relative_path + '/api/admin/plugins/phone-verification/search', { phone: phone }, function(data) {
				usersTbody.empty();
				if (data.success && data.found) {
					tr(buildUserRow(data.user)).then(function (translated) {
						usersTbody.append(translated);
					});
				} else {
					tr('<tr><td colspan="6" class="text-center">[[phone-verification:admin.user-not-found-search]]</td></tr>').then(function (translated) {
						usersTbody.html(translated);
					});
				}
			});
		});
	};

	return ACP;
});
