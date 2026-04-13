// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt
frappe.ui.form.Attachments = class Attachments {
	constructor(opts) {
		$.extend(this, opts);

		this.attachments_page_length = 10; // show n attachments initially
		this.show_all_attachments = false;
		this.is_bulk_delete_mode = false;
		this.selected_attachments = new Set();

		this.make();
	}
	make() {
		this.parent.find(".add-attachment-btn").on("click", () => {
			this.new_attachment();
		});

		this.parent.find(".explore-link").click(() => {
			if (!this.frm.attachments.get_attachments()?.length) return;
			frappe.open_in_new_tab = true;
			frappe.set_route("List", "File", {
				attached_to_doctype: this.frm.doctype,
				attached_to_name: this.frm.docname,
			});
		});

		this.add_attachment_wrapper = this.parent.find(".attachments-actions");
		this.attachments_label = this.parent.find(".attachments-label");
		this.bulk_delete_btn = this.parent.find(".bulk-delete-attachment-btn");
		this.bulk_delete_actions = this.parent.find(".attachment-bulk-actions");
		this.selection_count = this.parent.find(".attachment-selection-count");
		this.delete_selected_btn = this.parent.find(".attachment-delete-selected-btn");
		this.cancel_selection_btn = this.parent.find(".attachment-cancel-selection-btn");

		this.setup_bulk_delete_actions();
	}
	max_reached(raise_exception = false) {
		const attachment_count = Object.keys(this.get_attachments()).length;
		const attachment_limit = this.frm.meta.max_attachments;
		if (attachment_limit && attachment_count >= attachment_limit) {
			if (raise_exception) {
				frappe.throw({
					title: __("Attachment Limit Reached"),
					message: __("Maximum attachment limit of {0} has been reached.", [
						cstr(attachment_limit).bold(),
					]),
				});
			}
			return true;
		}
		return false;
	}
	refresh() {
		if (this.frm.doc.__islocal) {
			this.parent.toggle(false);
			return;
		}
		this.parent.toggle(true);
		this.sync_selected_attachments();
		this.parent.find(".attachment-row").remove();

		const max_reached = this.max_reached();
		const attachments = this.get_attachments();
		this.render_actions_state(max_reached, attachments);

		// add attachment objects
		this.render_attachments(attachments);
		this.setup_show_all_button(attachments);
	}

	setup_show_all_button(attachments) {
		// show button if there is more to show and user has not clicked on "Show All"
		let is_slicable = attachments.length > this.attachments_page_length;
		let show = !this.show_all_attachments && is_slicable;

		let show_all_btn = this.parent.find(".show-all-btn");
		if (!show) {
			show_all_btn.addClass("hidden");
			return;
		}

		show_all_btn.removeClass("hidden");
		show_all_btn.off("click").on("click", (event) => {
			event.preventDefault();
			show_all_btn.addClass("hidden");
			this.show_all_attachments = true;
			this.refresh();
		});
	}

	setup_bulk_delete_actions() {
		this.bulk_delete_btn.on("click", () => {
			this.enter_bulk_delete_mode();
		});

		this.cancel_selection_btn.on("click", () => {
			this.exit_bulk_delete_mode();
		});

		this.delete_selected_btn.on("click", () => {
			const fileids = this.get_selected_attachments();
			if (!fileids.length) return;

			frappe.confirm(
				__(
					"This will permanently delete the selected attachments and their underlying files. Continue?"
				),
				() => this.remove_attachments(fileids)
			);
		});
	}

	get_attachments() {
		return this.frm.get_docinfo().attachments || [];
	}

	render_attachments(attachments) {
		let attachments_to_render = attachments;

		let is_slicable = attachments.length > this.attachments_page_length;
		if (!this.show_all_attachments && is_slicable) {
			// render last n attachments as they are at the top
			let start = attachments.length - this.attachments_page_length;
			attachments_to_render = attachments.slice(start, attachments.length);
		}

		if (attachments_to_render.length) {
			attachments_to_render.forEach((attachment) => {
				this.add_attachment(attachment);
			});
		}

		if (!attachments.length) {
			// If no attachments in totality
			this.attachments_label.removeClass("has-attachments");
		}
	}

	add_attachment(attachment) {
		let file_name = attachment.file_name;
		let file_url = this.get_file_url(attachment);
		let fileid = attachment.name;
		if (!file_name) {
			file_name = file_url;
		}

		let file_label = `
			<a href="${file_url}" target="_blank" title="${frappe.utils.escape_html(file_name)}"
				class="ellipsis" style="max-width: calc(100% - 43px);"
			>
				<span>${file_name}</span>
			</a>`;

		let remove_action = null;
		if (this.can_delete_attachment() && !this.is_bulk_delete_mode) {
			remove_action = (target_id) => {
				frappe.confirm(__("Are you sure you want to delete the attachment?"), () => {
					this.remove_attachment(target_id);
				});
				return false;
			};
		}

		const icon = `<a href="/app/file/${fileid}">
				${frappe.utils.icon(attachment.is_private ? "es-line-lock" : "es-line-unlock", "sm ml-0")}
			</a>`;

		const row = $(`<li class="attachment-row">`);

		if (this.is_bulk_delete_mode) {
			const checkbox = $(`
				<label class="attachment-select-row">
					<input type="checkbox">
				</label>
			`);

			checkbox.find("input")
				.prop("checked", this.selected_attachments.has(fileid))
				.on("change", (event) => {
					this.toggle_attachment_selection(fileid, event.currentTarget.checked);
				});

			row.append(checkbox);
		}

		row.append(frappe.get_data_pill(file_label, fileid, remove_action, icon))
			.insertAfter(this.add_attachment_wrapper);
	}

	enter_bulk_delete_mode() {
		if (!this.can_delete_attachment() || !this.get_attachments().length) return;
		this.is_bulk_delete_mode = true;
		this.refresh();
	}

	exit_bulk_delete_mode(clear_selection = true) {
		this.is_bulk_delete_mode = false;
		if (clear_selection) {
			this.selected_attachments.clear();
		}
		this.refresh();
	}

	render_actions_state(max_reached, attachments) {
		const can_delete = this.can_delete_attachment();
		const has_attachments = attachments.length > 0;

		this.add_attachment_wrapper
			.find(".add-attachment-btn")
			.toggle(!this.is_bulk_delete_mode && !max_reached);

		this.bulk_delete_btn.toggleClass(
			"hidden",
			!can_delete || !has_attachments || this.is_bulk_delete_mode
		);
		this.bulk_delete_actions.toggleClass("hidden", !this.is_bulk_delete_mode);
		this.selection_count.text(__("Selected {0}", [this.selected_attachments.size]));
		this.delete_selected_btn.prop("disabled", !this.selected_attachments.size);
	}

	toggle_attachment_selection(fileid, checked) {
		if (checked) {
			this.selected_attachments.add(fileid);
		} else {
			this.selected_attachments.delete(fileid);
		}

		this.render_actions_state(this.max_reached(), this.get_attachments());
	}

	get_selected_attachments() {
		return Array.from(this.selected_attachments);
	}

	sync_selected_attachments() {
		const attachment_ids = new Set(this.get_attachments().map((attachment) => attachment.name));

		this.selected_attachments.forEach((fileid) => {
			if (!attachment_ids.has(fileid)) {
				this.selected_attachments.delete(fileid);
			}
		});

		if (!this.selected_attachments.size && this.is_bulk_delete_mode && !attachment_ids.size) {
			this.is_bulk_delete_mode = false;
		}
	}

	remove_attachments(fileids) {
		return frappe.call({
			method: "frappe.desk.form.utils.remove_attachments",
			type: "DELETE",
			args: {
				dt: this.frm.doctype,
				dn: this.frm.docname,
				file_ids: fileids,
			},
			callback: (r) => {
				if (r.exc) {
					if (!r._server_messages) frappe.msgprint(__("There were errors"));
					return;
				}

				const deleted = r.message?.deleted || [];
				const failed = r.message?.failed || [];

				this.selected_attachments = new Set(failed.map((row) => row.file_id));

				if (!failed.length) {
					this.is_bulk_delete_mode = false;
				}

				this.frm.sidebar.reload_docinfo(() => {
					if (!failed.length) {
						frappe.show_alert(__("Deleted {0} attachments", [deleted.length]));
						return;
					}

					const error_rows = failed
						.map((row) => {
							const file = frappe.utils.escape_html(row.file_name || row.file_id);
							const error = frappe.utils.escape_html(row.error || __("Unknown error"));
							return `<div>${file}: ${error}</div>`;
						})
						.join("");

					frappe.msgprint({
						title: __("Some attachments could not be deleted"),
						message: error_rows,
						indicator: "orange",
					});
				});
			},
		});
	}

	can_delete_attachment() {
		if (this.frm.meta.protect_attached_files) {
			switch (this.frm.doc.docstatus) {
				case 0:
					return this.frm.has_perm("write");
				case 2:
					return this.frm.has_perm("write") && this.frm.has_perm("delete");
				default:
					return false;
			}
		}

		return this.frm.has_perm("write");
	}

	get_file_url(attachment) {
		var file_url = attachment.file_url;
		if (!file_url) {
			if (attachment.file_name.indexOf("files/") === 0) {
				file_url = "/" + attachment.file_name;
			} else {
				file_url = "/files/" + attachment.file_name;
			}
		}
		// hash is not escaped, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI
		return encodeURI(file_url).replace(/#/g, "%23");
	}
	get_file_id_from_file_url(file_url) {
		var fid;
		$.each(this.get_attachments(), function (i, attachment) {
			if (attachment.file_url === file_url) {
				fid = attachment.name;
				return false;
			}
		});
		return fid;
	}
	remove_attachment_by_filename(filename, callback) {
		this.remove_attachment(this.get_file_id_from_file_url(filename), callback);
	}
	remove_attachment(fileid, callback) {
		if (!fileid) {
			if (callback) callback();
			return;
		}

		var me = this;
		return frappe.call({
			method: "frappe.desk.form.utils.remove_attach",
			type: "DELETE",
			args: {
				fid: fileid,
				dt: me.frm.doctype,
				dn: me.frm.docname,
			},
			callback: function (r, rt) {
				if (r.exc) {
					if (!r._server_messages) frappe.msgprint(__("There were errors"));
					return;
				}
				me.remove_fileid(fileid);
				me.frm.sidebar.reload_docinfo();
				if (callback) callback();
			},
		});
	}
	new_attachment(fieldname) {
		if (this.dialog) {
			// remove upload dialog
			this.dialog.$wrapper.remove();
		}

		const restrictions = {};
		if (this.frm.meta.max_attachments) {
			restrictions.max_number_of_files =
				this.frm.meta.max_attachments - this.frm.attachments.get_attachments().length;
		}

		new frappe.ui.FileUploader({
			doctype: this.frm.doctype,
			docname: this.frm.docname,
			frm: this.frm,
			folder: "Home/Attachments",
			on_success: (file_doc) => {
				this.attachment_uploaded(file_doc);
			},
			restrictions,
			make_attachments_public: this.frm.meta.make_attachments_public,
		});
	}
	get_args() {
		return {
			from_form: 1,
			doctype: this.frm.doctype,
			docname: this.frm.docname,
		};
	}
	attachment_uploaded(attachment) {
		this.dialog && this.dialog.hide();
		this.update_attachment(attachment);
		this.frm.sidebar.reload_docinfo();

		if (this.fieldname) {
			this.frm.set_value(this.fieldname, attachment.file_url);
		}
	}
	update_attachment(attachment) {
		if (attachment.name) {
			this.add_to_attachments(attachment);
			this.refresh();
		}
	}
	add_to_attachments(attachment) {
		var form_attachments = this.get_attachments();
		for (var i in form_attachments) {
			// prevent duplicate
			if (form_attachments[i]["name"] === attachment.name) return;
		}
		form_attachments.push(attachment);
	}
	remove_fileid(fileid) {
		var attachments = this.get_attachments();
		var new_attachments = [];
		$.each(attachments, function (i, attachment) {
			if (attachment.name !== fileid) {
				new_attachments.push(attachment);
			}
		});
		this.frm.get_docinfo().attachments = new_attachments;
		this.refresh();
	}
};
