/* globals fileUploadHandler */

import toastr from 'toastr';
import mime from 'mime-type/with-db';

Template.avatarPrompt.onCreated(function() {
	const self = this;
	self.suggestions = new ReactiveVar;
	self.upload = new ReactiveVar;
	self.getSuggestions = function() {
		self.suggestions.set(undefined);
		Meteor.call('getAvatarSuggestion', function(error, avatars) {
			self.suggestions.set({ ready: true, avatars });
		});
	};
	self.getSuggestions();
});

Template.avatarPrompt.onRendered(function() {
	Tracker.afterFlush(function() {
		if (!RocketChat.settings.get('Accounts_AllowUserAvatarChange')) {
			FlowRouter.go('home');
		}
		SideNav.setFlex('accountFlex');
		SideNav.openFlex();
	});
});

Template.avatarPrompt.helpers({
	suggestions() {
		return Template.instance().suggestions.get();
	},
	suggestAvatar(service) {
		const suggestions = Template.instance().suggestions.get();
		return RocketChat.settings.get(`Accounts_OAuth_${ _.capitalize(service) }`) && !suggestions.avatars[service];
	},
	upload() {
		return Template.instance().upload.get();
	},
	username() {
		const user = Meteor.user();
		return user && user.username;
	},
	initialsUsername() {
		const user = Meteor.user();
		return `@${ user && user.username }`;
	}
});

Template.avatarPrompt.events({
	'click .select-service'(event, instance) {
		if (this.service === 'initials') {
			Meteor.call('resetAvatar', function(err) {
				if (err && err.details.timeToReset && err.details.timeToReset) {
					toastr.error(t('error-too-many-requests', {
						seconds: parseInt(err.details.timeToReset / 1000)
					}));
				} else {
					toastr.success(t('Avatar_changed_successfully'));
					RocketChat.callbacks.run('userAvatarSet', 'initials');
				}
			});
		} else if (this.service === 'url') {
			if (_.trim($('#avatarurl').val())) {
				Meteor.call('setAvatarFromService', $('#avatarurl').val(), '', this.service, function(err) {
					if (err) {
						if (err.details.timeToReset && err.details.timeToReset) {
							toastr.error(t('error-too-many-requests', {
								seconds: parseInt(err.details.timeToReset / 1000)
							}));
						} else {
							toastr.error(t('Avatar_url_invalid_or_error'));
						}
					} else {
						toastr.success(t('Avatar_changed_successfully'));
						RocketChat.callbacks.run('userAvatarSet', 'url');
					}
				});
			} else {
				toastr.error(t('Please_enter_value_for_url'));
			}
		} else {
			let files = instance.find('input[type=file]').files;
			if (!files || files.length === 0) {
				files = event.dataTransfer && event.dataTransfer.files || [];
			}

			for (const file of files) {
				Object.defineProperty(file, 'type', { value: mime.lookup(file.name) });
			}

			const record = {
				name: files[0].name,
				size: files[0].size,
				type: files[0].type
				// description: document.getElementById('file-description').value
			};

			const upload = fileUploadHandler('avatar', record, files[0]);

			// upload.onProgress = (progress) ->
			// 	console.log 'progress ->', progress

			upload.start((error, result) => {
				if (result) {
					Meteor.call('saveAvatarFile', result, () => {
						toastr.success(t('Avatar_changed_successfully'));
						RocketChat.callbacks.run('userAvatarSet', this.service);
					});
				}
			});
		}
	},
	'click .login-with-service'(event, template) {
		const loginWithService = `loginWith${ _.capitalize(this) }`;
		const serviceConfig = {};
		Meteor[loginWithService](serviceConfig, function(error) {
			if (error && error.error) {
				if (error.error === 'github-no-public-email') {
					return alert(t('github_no_public_email'));
				}
				console.log(error);
				return toastr.error(error.message);
			}
			template.getSuggestions();
		});
	},
	'change .avatar-file-input'(event, template) {
		const e = event.originalEvent || event;
		let files = e.target.files;
		if (!files || files.length === 0) {
			files = (e.dataTransfer && e.dataTransfer.files) || [];
		}
		Object.keys(files).forEach(key => {
			const blob = files[key];
			if (!/image\/.+/.test(blob.type)) {
				return;
			}
			const reader = new FileReader();
			reader.readAsDataURL(blob);
			reader.onloadend = function() {
				template.upload.set({
					service: 'upload',
					contentType: blob.type,
					blob: reader.result
				});
				RocketChat.callbacks.run('userAvatarSet', 'upload');
			};
		});
	}
});
