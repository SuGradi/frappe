frappe.ui.form.ControlAttach = class ControlAttach extends frappe.ui.form.ControlData {
	is_multiple_mode() {
		const options = this.df.options;
		if (typeof options === 'string') {
			return ['multiple', 'multi', 'multiple_files'].includes(options.toLowerCase().trim());
		}
		return false;
	}

	set_disp_area(value) {
		let file_urls = this.get_files_from_value(value || this.value);
		
		if (file_urls.length > 0) {
			// 移除外层容器的默认样式（如灰底、边框等），避免样式叠加
			this.disp_area && $(this.disp_area).removeClass('like-disabled-input form-control');
			
			let html = '<div class="attached-files-list">';
			file_urls.forEach(url => {
				let filename = url.split("/").pop();
				try {
					filename = decodeURI(filename);
				} catch (e) {
					// ignore
				}
				html += `<div class="attached-file-item flex justify-between align-center" style="margin-bottom: 5px; padding: 5px 10px; border: 1px solid var(--border-color); background-color: var(--control-bg); border-radius: 8px;">
					<div class="ellipsis" style="flex: 1;">
						${frappe.utils.icon("es-line-link", "sm")}
						<a class="attached-file-link" href="${url}" target="_blank" title="${filename}">${filename}</a>
					</div>
				</div>`;
			});
			html += '</div>';
			this.disp_area && $(this.disp_area).html(html);
		} else {
			// 无文件时恢复默认样式以显示 Placeholder
			this.disp_area && $(this.disp_area).addClass('like-disabled-input');
			this.disp_area && $(this.disp_area).html(this.df.placeholder || "");
		}
	}

	make_input() {
		let me = this;
		this.$input = $('<button class="btn btn-default btn-sm btn-attach">')
			.html(__("Attach"))
			.prependTo(me.input_area)
			.on({
				click: function () {
					me.on_attach_click();
				},
				attach_doc_image: function () {
					me.on_attach_doc_image();
				},
			});
		this.$value = $(
			`<div class="attached-file flex justify-between align-center">
				<div class="ellipsis">
				${frappe.utils.icon("es-line-link", "sm")}
					<a class="attached-file-link" target="_blank"></a>
				</div>
				<div>
					<a class="btn btn-xs btn-default" data-action="reload_attachment">${__("Reload File")}</a>
					<a class="btn btn-xs btn-default" data-action="clear_attachment">${__("Clear")}</a>
				</div>
			</div>`
		)
			.prependTo(me.input_area)
			.toggle(false);
		// 多文件列表容器
		this.$file_list = null;
		this.input = this.$input.get(0);
		this.set_input_attributes();
		this.has_input = true;

		frappe.utils.bind_actions_with_object(this.$value, this);
		this.toggle_reload_button();
	}
	clear_attachment() {
		let me = this;
		if (this.is_multiple_mode()) {
			// 多文件模式：清空所有文件
			frappe.confirm(__("Are you sure you want to delete all attachments?"), function () {
				let file_urls = [];
				try {
					file_urls = me.value ? JSON.parse(me.value) : [];
				} catch (e) {
					file_urls = me.value ? [me.value] : [];
				}

				if (me.frm) {
					me.parse_validate_and_set_in_model(JSON.stringify([]));
					me.refresh();

					// 删除所有附件
					file_urls.forEach(url => {
						me.frm.attachments.remove_attachment_by_filename(url);
					});

					me.frm.doc.docstatus == 1 ? me.frm.save("Update") : me.frm.save();
				} else {
					me.set_input(JSON.stringify([]));
					me.parse_validate_and_set_in_model(JSON.stringify([]));
					me.refresh();
				}
			});
		} else {
			// 单文件模式（兼容处理可能残留的多文件数据）
			frappe.confirm(__("Are you sure you want to delete the attachment?"), function () {
				if (me.frm) {
					let file_urls = me.get_files_from_value(me.value);
					me.parse_validate_and_set_in_model(null);
					me.refresh();

					let files_to_remove = [];
					if (me.frm.attachments && file_urls.length > 0) {
						let attachments = me.frm.attachments.get_attachments() || [];
						file_urls.forEach((url) => {
							let target = decodeURI(url);
							let found = attachments.find((a) => {
								let a_url = decodeURI(a.file_url);
								return (
									a_url === target ||
									a_url === "/" + target ||
									"/" + a_url === target ||
									(a.file_name && target.endsWith(a.file_name))
								);
							});
							if (found) {
								files_to_remove.push(found.name);
							}
						});
					}

					let save_callback = async () => {
						await me.parse_validate_and_set_in_model(null);
						me.refresh();
						me.frm.doc.docstatus == 1 ? me.frm.save("Update") : me.frm.save();
					};

					if (files_to_remove.length > 0) {
						// 递归删除所有找到的附件
						let delete_next = (index) => {
							if (index >= files_to_remove.length) {
								save_callback();
								return;
							}
							console.debug(
								"[Attach] Removing file in single-mode cleanup:",
								files_to_remove[index]
							);
							me.frm.attachments.remove_attachment(files_to_remove[index], () => {
								delete_next(index + 1);
							});
						};
						delete_next(0);
					} else {
						// 没找到 Sidebar 记录，如果是单个 URL，尝试旧方法
						if (file_urls.length === 1) {
							console.warn(
								"[Attach] Sidebar not matched, trying legacy removal:",
								file_urls[0]
							);
							me.frm.attachments.remove_attachment_by_filename(
								file_urls[0],
								save_callback
							);
						} else {
							save_callback();
						}
					}
				} else {
					me.dataurl = null;
					me.fileobj = null;
					me.set_input(null);
					me.parse_validate_and_set_in_model(null);
					me.refresh();
				}
			});
		}
	}
	reload_attachment() {
		if (this.file_uploader) {
			this.file_uploader.uploader.upload_files();
		}
	}
	on_attach_click() {
		this.set_upload_options();
		this.file_uploader = new frappe.ui.FileUploader(this.upload_options);
	}
	on_attach_doc_image() {
		this.set_upload_options();
		this.upload_options.restrictions.allowed_file_types = ["image/*"];
		this.file_uploader = new frappe.ui.FileUploader(this.upload_options);
	}

	cleanup_failed_upload() {
		// Revert value
		this.value = this._value_before_upload;
		this.render_files();
		this.parse_validate_and_set_in_model(this.value);
		
		// Delete uploaded files
		if (this._uploaded_attachments && this._uploaded_attachments.length > 0) {
			this._uploaded_attachments.forEach(att => {
				if (this.frm.attachments) {
					this.frm.attachments.remove_attachment(att.name);
				} else {
						frappe.call({
						method: 'frappe.client.delete',
						args: { doctype: 'File', name: att.name }
						});
				}
			});
		}
		this._uploaded_attachments = [];
	}

	set_upload_options() {
		let is_multiple = this.is_multiple_mode();
		let options = {
			allow_multiple: is_multiple,
			on_success: (file) => {
				this.on_upload_complete(file);
				this.toggle_reload_button();
			},
			restrictions: {},
		};

		if (this.frm) {
			options.doctype = this.frm.doctype;
			options.docname = this.frm.docname;
			options.fieldname = this.df.fieldname;
			options.make_attachments_public = this.df.make_attachment_public
				? 1
				: this.frm.meta.make_attachments_public;
		}

		if (this.df.options && typeof this.df.options === 'object') {
			Object.assign(options, this.df.options);
		}
		this.upload_options = options;

		// Initialize rollback state
		this._value_before_upload = this.value;
		this._uploaded_attachments = [];

		// 初始化多文件上传缓存
		if (is_multiple) {
			this._pending_files = null;
		}
	}

	set_input(value, dataurl) {
		this.last_value = this.value;
		this.value = value;
		this.render_files();
	}

	get_value() {
		return this.value || null;
	}

	async on_upload_complete(attachment) {
		// Track new attachment
		if (this._uploaded_attachments) {
			this._uploaded_attachments.push(attachment);
		}

		const do_save = () => {
			let action = this.frm.doc.docstatus == 1 ? "Update" : "Save";
			this.frm.save(action,
				(r) => {
					if (r.exc) this.cleanup_failed_upload();
				},
				null,
				() => this.cleanup_failed_upload()
			);
		};

		if (this.is_multiple_mode()) {
			// 多文件模式：使用缓存避免竞态条件

			// 首次调用时初始化缓存
			if (this._pending_files === null) {
				this._pending_files = this.get_files_from_value(this.get_value());
			}

			// 追加新文件到缓存
			this._pending_files.push(attachment.file_url);

			// 更新显示（使用缓存值）
			this.value = JSON.stringify(this._pending_files);
			this.render_files();

			// 更新附件记录
			if (this.frm) {
				this.frm.attachments.update_attachment(attachment);
			}

			// 检查是否所有文件都已上传完成
			if (this.file_uploader && this.file_uploader.uploader) {
				let total_files = this.file_uploader.uploader.files.length;
				let uploaded_files = this.file_uploader.uploader.files.filter(
					f => f.request_succeeded
				).length;

				// 所有文件上传完成后，保存到数据库并清理缓存
				if (uploaded_files === total_files) {
					if (this.frm) {
						await this.parse_validate_and_set_in_model(JSON.stringify(this._pending_files));
						do_save();
					}
					// 清理缓存
					this._pending_files = null;
				}
			} else {
				// 如果没有 file_uploader，直接保存
				if (this.frm) {
					await this.parse_validate_and_set_in_model(JSON.stringify(this._pending_files));
					do_save();
				}
				this._pending_files = null;
			}
		} else {
			// 单文件模式：当前逻辑
			if (this.frm) {
				await this.parse_validate_and_set_in_model(attachment.file_url);
				this.frm.attachments.update_attachment(attachment);
				do_save();
			}
			this.set_value(attachment.file_url);
		}
	}

	toggle_reload_button() {
		this.$value
			.find('[data-action="reload_attachment"]')
			.toggle(this.file_uploader && this.file_uploader.uploader.files.length > 0);
	}

	get_files_from_value(value) {
		if (!value) return [];
		if (Array.isArray(value)) return value;
		if (typeof value === "string") {
			let v = value.trim();
			if (!v) return [];
			try {
				let parsed = JSON.parse(v);
				if (Array.isArray(parsed)) return parsed;
			} catch (e) {
				// ignore
			}
			return [value];
		}
		return [];
	}

	render_files() {
		let file_urls = this.get_files_from_value(this.value);

		if (!Array.isArray(file_urls)) {
			file_urls = [file_urls];
		}

		// 隐藏旧的单文件 UI 容器
		if (this.$value) this.$value.toggle(false);

		// 控制 Attach 按钮显隐：多文件模式常显，单文件模式仅在无文件时显示
		if (this.is_multiple_mode()) {
			this.$input.toggle(true);
		} else {
			this.$input.toggle(file_urls.length === 0);
		}

		if (file_urls.length > 0) {
			let html = '<div class="attached-files-list" style="margin-top: 10px;">';
			file_urls.forEach((url, index) => {
				let filename = url.split("/").pop();
				try {
					filename = decodeURI(filename);
				} catch (e) {
					// ignore
				}
				html += `
					<div class="attached-file-item flex justify-between align-center" style="margin-bottom: 5px; padding: 5px 10px; border: 1px solid var(--border-color); background-color: var(--control-bg); border-radius: 8px;">
						<div class="ellipsis" style="flex: 1;">
							${frappe.utils.icon("es-line-link", "sm")}
							<a class="attached-file-link" href="${url}" target="_blank">${filename}</a>
						</div>
						<div>
							<a class="btn btn-xs btn-default" data-action="remove_file" data-index="${index}">${__("Clear")}</a>
						</div>
					</div>
				`;
			});
			html += "</div>";

			if (this.$file_list) {
				this.$file_list.remove();
			}
			this.$file_list = $(html).appendTo(this.input_area);

			frappe.utils.bind_actions_with_object(this.$file_list, this);
		} else {
			if (this.$file_list) {
				this.$file_list.remove();
			}
		}
	}

remove_file(e, $el) {
		let index = parseInt($el.data('index'));
		let me = this;

		frappe.confirm(__("Are you sure you want to delete the attachment?"), function () {
			let file_urls = me.get_files_from_value(me.value);
			console.debug("[Attach] remove_file: index", index, "urls", file_urls);

			if (!Array.isArray(file_urls)) {
				file_urls = [file_urls];
			}

			let removed_url = file_urls[index];
			if (!removed_url) {
				console.error("[Attach] remove_file: No url found at index", index);
				return;
			}

			let file_id = null;
			if (me.frm && me.frm.attachments) {
				let attachments = me.frm.attachments.get_attachments();
				if (attachments) {
					let target = decodeURI(removed_url);
					for (let a of attachments) {
						let a_url = decodeURI(a.file_url);
						// 尝试多种匹配方式以应对编码和路径前缀差异
						if (
							a_url === target ||
							a_url === "/" + target ||
							"/" + a_url === target ||
							(a.file_name && target.endsWith(a.file_name))
						) {
							file_id = a.name;
							break;
						}
					}
				}
			}

			let update_field_and_save = () => {
				file_urls.splice(index, 1);
				let new_val;
				if (file_urls.length === 0 && !me.is_multiple_mode()) {
					new_val = null;
				} else {
					new_val = JSON.stringify(file_urls);
				}

				if (me.frm) {
					me.parse_validate_and_set_in_model(new_val).then(() => {
						me.refresh();
						me.frm.doc.docstatus == 1 ? me.frm.save("Update") : me.frm.save();
					});
				} else {
					me.set_input(new_val);
					me.parse_validate_and_set_in_model(new_val);
					me.refresh();
				}
			};

			if (file_id && me.frm && me.frm.attachments) {
				// 使用 Sidebar 原生方法删除，确保 Sidebar 列表同步更新
				me.frm.attachments.remove_attachment(file_id, update_field_and_save);
			} else {
				// 没找到 Sidebar 对应项（可能已删除），只更新字段值
				update_field_and_save();
			}
		});
	}
};
