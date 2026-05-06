const ATTACHMENT_LIGHTBOX_CSS_URL = "https://sys.autohaina.com/files/fancybox.css";
const ATTACHMENT_LIGHTBOX_JS_URL = "https://sys.autohaina.com/files/fancybox.umd.js";

frappe.provide("frappe.ui.form");

frappe.ui.form.get_attachment_lightbox_helper = frappe.ui.form.get_attachment_lightbox_helper || function () {
	if (frappe.ui.form.__attachment_lightbox_helper) {
		return frappe.ui.form.__attachment_lightbox_helper;
	}

	const helper = {
		resource_promise: null,
		normalize_url(url) {
			if (!url) return "";

			try {
				const parsed = new URL(url, window.location.origin);
				return parsed.pathname + parsed.search;
			} catch (error) {
				return String(url).split("#")[0];
			}
		},
		is_image_url(url) {
			const normalized = this.normalize_url(url).split("?")[0].toLowerCase();
			return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/.test(normalized);
		},
		is_video_url(url) {
			const normalized = this.normalize_url(url).split("?")[0].toLowerCase();
			return /\.(m4v|mov|mp4|og[gv]|webm)$/.test(normalized);
		},
		is_pdf_url(url) {
			const normalized = this.normalize_url(url).split("?")[0].toLowerCase();
			return /\.pdf$/.test(normalized);
		},
		is_previewable_url(url) {
			return this.is_image_url(url) || this.is_video_url(url) || this.is_pdf_url(url);
		},
		get_video_format(url) {
			const normalized = this.normalize_url(url).split("?")[0].toLowerCase();
			const match = normalized.match(/\.([^.]+)$/);

			if (!match) return "video/mp4";

			const extension = match[1];
			if (["ogv", "ogg"].includes(extension)) return "video/ogg";
			if (extension === "webm") return "video/webm";
			return "video/mp4";
		},
		build_item(url, caption) {
			const type = this.is_video_url(url) ? "html5video" : this.is_pdf_url(url) ? "pdf" : "image";
			const item = {
				src: url,
				type,
				caption: caption || this.get_filename(url),
			};

			if (item.type === "html5video") {
				item.html5videoFormat = this.get_video_format(url);
			}

			return item;
		},
		get_filename(url) {
			let filename = (this.normalize_url(url).split("/").pop() || "").split("?")[0];
			try {
				filename = decodeURIComponent(filename);
			} catch (error) {
				// ignore malformed url encoding
			}
			return filename;
		},
		build_items_from_urls(file_urls) {
			return (file_urls || [])
				.filter((url) => this.is_previewable_url(url))
				.map((url) => this.build_item(url));
		},
		build_items_from_attachments(attachments) {
			return (attachments || [])
				.filter((attachment) => attachment && this.is_previewable_url(attachment.file_url))
				.map((attachment) =>
					this.build_item(
						attachment.file_url,
						attachment.file_name || this.get_filename(attachment.file_url)
					)
				);
		},
		ensure_resources() {
			if (typeof window === "undefined") {
				return Promise.resolve();
			}

			if (window.Fancybox && typeof window.Fancybox.show === "function") {
				return Promise.resolve(window.Fancybox);
			}

			if (this.resource_promise) {
				return this.resource_promise;
			}

			this.resource_promise = new Promise((resolve, reject) => {
				if (!document.querySelector('link[data-attachment-lightbox="css"]')) {
					const link = document.createElement("link");
					link.rel = "stylesheet";
					link.href = ATTACHMENT_LIGHTBOX_CSS_URL;
					link.dataset.attachmentLightbox = "css";
					document.head.appendChild(link);
				}

				const existing_script = document.querySelector('script[data-attachment-lightbox="js"]');
				if (existing_script) {
					if (window.Fancybox && typeof window.Fancybox.show === "function") {
						resolve(window.Fancybox);
						return;
					}
					existing_script.addEventListener("load", () => resolve(window.Fancybox), { once: true });
					existing_script.addEventListener("error", reject, { once: true });
					return;
				}

				const script = document.createElement("script");
				script.src = ATTACHMENT_LIGHTBOX_JS_URL;
				script.async = true;
				script.dataset.attachmentLightbox = "js";
				script.onload = () => resolve(window.Fancybox);
				script.onerror = reject;
				document.head.appendChild(script);
			});

			return this.resource_promise;
		},
		open(items, current_url) {
			if (!items || !items.length) {
				return Promise.resolve();
			}

			const normalized_current = this.normalize_url(current_url);
			const startIndex = Math.max(
				0,
				items.findIndex((item) => this.normalize_url(item.src) === normalized_current)
			);

			return this.ensure_resources().then((Fancybox) => {
				if (!Fancybox || typeof Fancybox.show !== "function") {
					return;
				}

				Fancybox.show(items, {
					startIndex,
					dragToClose: false,
					fadeEffect: false,
					zoomEffect: false,
					showClass: false,
					hideClass: false,
					hideScrollbar: false,
					placeFocusBack: false,
				});
			});
		},
	};

	frappe.ui.form.__attachment_lightbox_helper = helper;
	return helper;
};

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
			this.bind_attachment_lightbox($(this.disp_area), file_urls);
		} else {
			// 无文件时恢复默认样式以显示 Placeholder
			this.disp_area && $(this.disp_area).addClass('like-disabled-input');
			this.disp_area && $(this.disp_area).html(this.df.placeholder || "");
		}
	}

	bind_attachment_lightbox($container, file_urls) {
		if (!$container || !$container.length) {
			return;
		}

		const helper = frappe.ui.form.get_attachment_lightbox_helper();
		$container.off("click.attachmentLightbox").on("click.attachmentLightbox", ".attached-file-link", (event) => {
			const href = event.currentTarget.getAttribute("href");
			if (!helper.is_previewable_url(href)) {
				return;
			}

			event.preventDefault();
			helper.open(helper.build_items_from_urls(file_urls), href);
		});
	}

		make_input() {
			let me = this;
			this.$action_buttons = $('<div class="attach-action-buttons flex" style="gap: 8px;"></div>').prependTo(
				me.input_area
			);
			this.$input = $('<button class="btn btn-default btn-sm btn-attach">')
				.html(__("Attach"))
				.appendTo(this.$action_buttons)
				.on({
					click: function () {
						me.on_attach_click();
					},
					attach_doc_image: function () {
						me.on_attach_doc_image();
					},
				});
			this.$bulk_delete_toggle = $(`
				<button
					class="btn btn-default btn-sm btn-attach-bulk-delete hidden"
					data-action="enter_bulk_delete_mode"
					title="${__("批量删除")}"
					aria-label="${__("批量删除")}"
				>
					${frappe.utils.icon("es-line-delete", "sm")}
				</button>
			`).appendTo(this.$action_buttons);
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
			this.is_bulk_delete_mode = false;
			this.selected_files = new Set();
			this.input = this.$input.get(0);
			this.set_input_attributes();
			this.has_input = true;

			frappe.utils.bind_actions_with_object(this.$value, this);
			frappe.utils.bind_actions_with_object(this.$action_buttons, this);
			this.toggle_reload_button();
		}

		enter_bulk_delete_mode() {
			if (!this.is_multiple_mode()) return;
			if (!this.get_files_from_value(this.value).length) return;
			this.is_bulk_delete_mode = true;
			this.render_files();
		}

		cancel_bulk_delete() {
			this.exit_bulk_delete_mode();
		}

		exit_bulk_delete_mode(clear_selection = true) {
			this.is_bulk_delete_mode = false;
			if (clear_selection) {
				this.selected_files.clear();
			}
			this.render_files();
		}

		toggle_file_selection(file_url, checked) {
			if (checked) {
				this.selected_files.add(file_url);
			} else {
				this.selected_files.delete(file_url);
			}
			this.render_files();
		}

		toggle_selected_file(e, $el) {
			const file_url = decodeURIComponent($el.data("fileUrl"));
			this.toggle_file_selection(file_url, $el.prop("checked"));
		}

		get_selected_files() {
			return Array.from(this.selected_files);
		}

		get_file_name_from_url(file_url) {
			let filename = file_url.split("/").pop();
			try {
				filename = decodeURIComponent(filename);
			} catch (e) {
				// ignore
			}
			return filename;
		}

		sync_selected_files(file_urls) {
			const available_urls = new Set(file_urls);
			this.selected_files.forEach((file_url) => {
				if (!available_urls.has(file_url)) {
					this.selected_files.delete(file_url);
				}
			});

			if (!file_urls.length) {
				this.is_bulk_delete_mode = false;
			}
		}

		find_attachment_by_url(file_url) {
			if (!this.frm?.attachments) return null;

			const target = decodeURI(file_url);
			return (this.frm.attachments.get_attachments() || []).find((attachment) => {
				const attachment_url = decodeURI(attachment.file_url || "");
				return (
					attachment_url === target ||
					attachment_url === "/" + target ||
					"/" + attachment_url === target ||
					(attachment.file_name && target.endsWith(attachment.file_name))
				);
			});
		}

		get_selected_attachments_payload() {
			const matched = [];
			const unmatched = [];

			this.get_selected_files().forEach((url) => {
				const attachment = this.find_attachment_by_url(url);
				if (attachment) {
					matched.push({ url, file_id: attachment.name, file_name: attachment.file_name });
				} else {
					unmatched.push(url);
				}
			});

			return { matched, unmatched };
		}

		show_bulk_delete_failures(failures) {
			if (!failures.length) return;

			const message = failures
				.map((row) => {
					const file = frappe.utils.escape_html(row.file_name);
					const error = frappe.utils.escape_html(row.error || __("未知错误"));
					return `<div>${file}: ${error}</div>`;
				})
				.join("");

			frappe.msgprint({
				title: __("部分附件删除失败"),
				message,
				indicator: "orange",
			});
		}

		async update_field_value_and_save(file_urls) {
			const next_value = file_urls.length ? JSON.stringify(file_urls) : JSON.stringify([]);

			if (this.frm) {
				await this.parse_validate_and_set_in_model(next_value);
				this.refresh();
				if (this.frm.is_dirty()) {
					this.frm.save(this.frm.doc.docstatus == 1 ? "Update" : "Save");
				}
				return;
			}

			this.set_input(next_value);
			await this.parse_validate_and_set_in_model(next_value);
			this.refresh();
		}

		async on_bulk_delete_complete(r, matched, unmatched, progress_title) {
			if (r.exc) {
				frappe.hide_progress();
				if (!r._server_messages) frappe.msgprint(__("删除附件时发生错误"));
				return;
			}

			const deleted_ids = new Set(r.message?.deleted || []);
			const failed_rows = r.message?.failed || [];
			const failed_ids = new Set(failed_rows.map((row) => row.file_id));
			const deleted_urls = matched
				.filter((row) => deleted_ids.has(row.file_id))
				.map((row) => row.url);
			const failed_urls = matched
				.filter((row) => failed_ids.has(row.file_id))
				.map((row) => row.url)
				.concat(unmatched);
			const current_urls = this.get_files_from_value(this.value);
			const next_urls = current_urls.filter((url) => !deleted_urls.includes(url));
			const failures = [
				...failed_rows.map((row) => ({
					file_name: row.file_name || row.file_id,
					error: row.error || __("未知错误"),
				})),
				...unmatched.map((url) => ({
					file_name: this.get_file_name_from_url(url),
					error: __("文件不存在"),
				})),
			];

			this.selected_files = new Set(failed_urls);
			if (!failed_urls.length) {
				this.is_bulk_delete_mode = false;
			}

			if (!deleted_urls.length) {
				frappe.hide_progress();
				this.render_files();
				this.show_bulk_delete_failures(failures);
				return;
			}

			if (this.frm?.sidebar) {
				await new Promise((resolve) => this.frm.sidebar.reload_docinfo(() => resolve()));
			}

			await this.update_field_value_and_save(next_urls);
			frappe.show_progress(progress_title, 100, 100, __("删除完成"), true);

			if (failures.length) {
				this.show_bulk_delete_failures(failures);
			} else {
				frappe.show_alert(__("已删除 {0} 个附件", [deleted_urls.length]));
			}
		}

		delete_selected_files() {
			const { matched, unmatched } = this.get_selected_attachments_payload();
			if (!matched.length && !unmatched.length) return;

			frappe.confirm(__("将永久删除所选附件及其底层文件，是否继续？"), () => {
				const progress_title = __("正在删除附件");
				frappe.show_progress(
					progress_title,
					0,
					100,
					__("正在删除 {0} 个附件，请稍候…", [matched.length + unmatched.length])
				);

				if (!matched.length) {
					frappe.hide_progress();
					this.selected_files = new Set(unmatched);
					this.show_bulk_delete_failures(
						unmatched.map((url) => ({
							file_name: this.get_file_name_from_url(url),
							error: __("文件不存在"),
						}))
					);
					return;
				}

				frappe.call({
					method: "frappe.desk.form.utils.remove_attachments",
					type: "DELETE",
					args: {
						dt: this.frm.doctype,
						dn: this.frm.docname,
						file_ids: matched.map((row) => row.file_id),
					},
					callback: (r) => this.on_bulk_delete_complete(r, matched, unmatched, progress_title),
				});
			});
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

			this.sync_selected_files(file_urls);
			this.$bulk_delete_toggle?.toggleClass(
				"hidden",
				!this.is_multiple_mode() || !file_urls.length || this.is_bulk_delete_mode
			);

			// 隐藏旧的单文件 UI 容器
			if (this.$value) this.$value.toggle(false);

			// 控制 Attach 按钮显隐：多文件模式常显，单文件模式仅在无文件时显示
			if (this.is_multiple_mode()) {
				this.$input.toggle(!this.is_bulk_delete_mode);
			} else {
				this.$input.toggle(file_urls.length === 0);
			}

			if (file_urls.length > 0) {
				let bulk_actions_html = "";
				if (this.is_multiple_mode()) {
					if (this.is_bulk_delete_mode) {
						bulk_actions_html = `
							<div class="attach-bulk-actions flex align-center" style="gap: 8px; margin-bottom: 10px;">
								<span class="attach-selection-count">${__("已选择 {0} 项", [this.selected_files.size])}</span>
								<button class="btn btn-xs btn-danger" data-action="delete_selected_files"${this.selected_files.size ? "" : " disabled"}>
									${__("删除")}
								</button>
								<button class="btn btn-xs btn-secondary" data-action="cancel_bulk_delete">
									${__("取消")}
								</button>
							</div>
						`;
					}
				}

				let html = `<div class="attached-files-list" style="margin-top: 10px;">${bulk_actions_html}`;
				file_urls.forEach((url, index) => {
					const filename = this.get_file_name_from_url(url);
					const selector_html = this.is_bulk_delete_mode
						? `
							<label class="attach-multi-select-row" style="margin-right: 8px;">
								<input
									type="checkbox"
									data-action="toggle_selected_file"
									data-file-url="${encodeURIComponent(url)}"
									${this.selected_files.has(url) ? "checked" : ""}
								>
							</label>
						`
						: "";
					const clear_html = this.is_bulk_delete_mode
						? ""
						: `<a class="btn btn-xs btn-default" data-action="remove_file" data-index="${index}">${__("Clear")}</a>`;
					html += `
						<div class="attached-file-item flex justify-between align-center" style="margin-bottom: 5px; padding: 5px 10px; border: 1px solid var(--border-color); background-color: var(--control-bg); border-radius: 8px;">
							<div class="flex align-center" style="flex: 1; min-width: 0;">
								${selector_html}
							<div class="ellipsis" style="flex: 1;">
								${frappe.utils.icon("es-line-link", "sm")}
								<a class="attached-file-link" href="${url}" target="_blank">${filename}</a>
							</div>
							</div>
							<div>
								${clear_html}
							</div>
						</div>
					`;
				});
			html += "</div>";

			if (this.$file_list) {
				this.$file_list.remove();
			}
			this.$file_list = $(html).appendTo(this.input_area);
			this.bind_attachment_lightbox(this.$file_list, file_urls);

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

				let file_id = me.find_attachment_by_url(removed_url)?.name;

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

if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		get_attachment_lightbox_helper: frappe.ui.form.get_attachment_lightbox_helper,
	};
}
