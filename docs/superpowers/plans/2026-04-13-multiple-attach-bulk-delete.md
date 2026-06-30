# Multiple Attach Bulk Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sidebar-style bulk delete to `Attach` fields running in `multiple|multi|multiple_files` mode, reusing the existing batch delete API and the current File deletion semantics.

**Architecture:** Extend `ControlAttach` with an internal selection mode for multi-file fields only. Keep the backend API unchanged by mapping selected field URLs to sidebar attachment `File.name` values, then call `frappe.desk.form.utils.remove_attachments`, update the field JSON value from the result, and show `frappe.show_progress` during deletion.

**Tech Stack:** Frappe form controls, Cypress E2E tests, existing `frappe.call` batch delete API, `frappe.show_progress`

---

## File Map

- Modify: `frappe/public/js/frappe/form/controls/attach.js`
  Adds bulk-delete mode, checkbox selection, URL-to-File mapping, progress dialog usage, and field-value reconciliation for multi-file `Attach`.
- Modify: `cypress/integration/control_attach.js`
  Adds a regression test for multi-file `Attach` bulk delete UI and behavior.
- Verify: `frappe/public/js/frappe/form/sidebar/attachments.js`
  Read-only reference for matching wording and delete flow. Do not change unless field logic truly needs a shared fix.
- Verify: `frappe/desk/form/utils.py`
  Read-only reference for batch delete response shape. Do not change unless a genuine gap is discovered during implementation.

### Task 1: Add the failing multi-file attach bulk-delete test

**Files:**
- Modify: `cypress/integration/control_attach.js`
- Verify: `frappe/public/js/frappe/form/controls/attach.js`

- [ ] **Step 1: Write the failing test**

Add a new context or test case that creates a doctype with a multi-file attach field and exercises the sidebar-style field bulk delete flow.

```javascript
it("supports bulk deleting files from a multiple attach field", () => {
	cy.window()
		.its("frappe")
		.then((frappe) =>
			frappe.xcall("frappe.tests.ui_test_helpers.create_doctype", {
				name: "Test Multiple Attach Control",
				fields: [
					{
						label: "Attach Files",
						fieldname: "attach_files",
						fieldtype: "Attach",
						options: "multiple",
						in_list_view: 1,
					},
				],
			})
		);

	cy.new_form("Test Multiple Attach Control");
	cy.findByRole("button", { name: "Attach" }).click();
	cy.get_open_dialog()
		.find(".file-upload-area")
		.selectFile(
			[
				"cypress/fixtures/sample_attachments/attachment-2.txt",
				"cypress/fixtures/sample_attachments/attachment-3.txt",
				"cypress/fixtures/sample_attachments/attachment-4.txt",
			],
			{ action: "drag-drop" }
		);
	cy.get_open_dialog().findByRole("button", { name: "Upload" }).click();

	cy.contains("button", "批量删除").click();
	cy.contains("已选择 0 项").should("be.visible");
	cy.contains("button", "删除").should("be.visible");
	cy.contains("button", "取消").should("be.visible");
	cy.get(".attach-multi-select-row input[type='checkbox']").eq(0).check({ force: true });
	cy.get(".attach-multi-select-row input[type='checkbox']").eq(1).check({ force: true });
	cy.contains("已选择 2 项").should("be.visible");

	cy.contains("button", "删除").click();
	cy.get_open_dialog().find(".modal-body").should("contain", "将永久删除所选附件及其底层文件，是否继续？");
	cy.get_open_dialog().find(".modal-footer .btn-primary").click();
	cy.get(".modal-title").should("contain", "正在删除附件");
	cy.get(".attached-file-item").should("have.length", 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx cypress run --config video=false --spec cypress/integration/control_attach.js
```

Expected:

- FAIL because the multi-file attach field does not yet render `批量删除`
- In this environment Cypress may abort before running due to missing `libasound.so.2`; if so, record that infrastructure blocker and continue with code/test authoring

- [ ] **Step 3: Commit**

```bash
git add cypress/integration/control_attach.js
git commit -m "test: cover bulk delete for multiple attach"
```

### Task 2: Add selection mode state and UI to `ControlAttach`

**Files:**
- Modify: `frappe/public/js/frappe/form/controls/attach.js`
- Verify: `frappe/public/js/frappe/form/sidebar/attachments.js`

- [ ] **Step 1: Write the failing implementation target in code comments or TODO-free stubs**

Add minimal state initialization and method stubs that make the target API explicit without implementing behavior yet.

```javascript
make_input() {
	// ...
	this.is_bulk_delete_mode = false;
	this.selected_files = new Set();
}

enter_bulk_delete_mode() {}
exit_bulk_delete_mode(clear_selection = true) {}
toggle_file_selection(file_url, checked) {}
get_selected_files() {
	return Array.from(this.selected_files);
}
```

- [ ] **Step 2: Implement minimal selection state**

Add the real state initialization and lifecycle cleanup.

```javascript
make_input() {
	// existing setup...
	this.$file_list = null;
	this.is_bulk_delete_mode = false;
	this.selected_files = new Set();
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
```

- [ ] **Step 3: Render the bulk action bar in multi-file mode**

In `render_files()`, prepend a bulk action row when `this.is_multiple_mode()` and there are files.

```javascript
let bulk_actions_html = "";

if (this.is_multiple_mode() && file_urls.length) {
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
	} else {
		bulk_actions_html = `
			<div class="attach-bulk-actions" style="margin-bottom: 10px;">
				<button class="btn btn-xs btn-default" data-action="enter_bulk_delete_mode">
					${__("批量删除")}
				</button>
			</div>
		`;
	}
}

let html = `<div class="attached-files-list" style="margin-top: 10px;">${bulk_actions_html}`;
```

- [ ] **Step 4: Render checkboxes only in selection mode**

Update each file row so the checkbox appears only in bulk-delete mode and the single-row clear action is hidden during selection.

```javascript
const checked = this.selected_files.has(url) ? "checked" : "";
const selector_html = this.is_bulk_delete_mode
	? `
		<label class="attach-multi-select-row" style="margin-right: 8px;">
			<input type="checkbox" data-action="toggle_selected_file" data-file-url="${encodeURIComponent(url)}" ${checked}>
		</label>
	`
	: "";

const clear_html = this.is_bulk_delete_mode
	? ""
	: `<a class="btn btn-xs btn-default" data-action="remove_file" data-index="${index}">${__("Clear")}</a>`;
```

- [ ] **Step 5: Add action handlers**

Implement action methods that match the rendered `data-action` hooks.

```javascript
enter_bulk_delete_mode() {
	if (!this.is_multiple_mode()) return;
	if (!this.get_files_from_value(this.value).length) return;
	this.is_bulk_delete_mode = true;
	this.render_files();
}

cancel_bulk_delete() {
	this.exit_bulk_delete_mode();
}

toggle_selected_file(e, $el) {
	const file_url = decodeURIComponent($el.data("fileUrl"));
	this.toggle_file_selection(file_url, $el.prop("checked"));
}
```

- [ ] **Step 6: Run the focused build-time validation**

Run:

```bash
bench build --apps frappe
```

Expected:

- PASS with updated `form.bundle.*`
- No syntax errors from `attach.js`

- [ ] **Step 7: Commit**

```bash
git add frappe/public/js/frappe/form/controls/attach.js
git commit -m "feat: add bulk selection mode to multiple attach"
```

### Task 3: Implement URL mapping and batch delete behavior

**Files:**
- Modify: `frappe/public/js/frappe/form/controls/attach.js`
- Verify: `frappe/desk/form/utils.py`
- Verify: `frappe/public/js/frappe/form/sidebar/attachments.js`

- [ ] **Step 1: Add a helper that maps field URLs to sidebar attachment rows**

Use the same matching rules already present in `remove_file()`.

```javascript
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
```

- [ ] **Step 2: Add a helper for selected URLs to batch-delete payload**

Build both a URL list and a `file_ids` list so successful deletions can be removed from the field value.

```javascript
get_selected_attachments_payload() {
	const selected_urls = this.get_selected_files();
	const matched = [];
	const unmatched = [];

	selected_urls.forEach((url) => {
		const attachment = this.find_attachment_by_url(url);
		if (attachment) {
			matched.push({ url, file_id: attachment.name });
		} else {
			unmatched.push(url);
		}
	});

	return { matched, unmatched };
}
```

- [ ] **Step 3: Implement the batch delete action with progress dialog**

Add a `delete_selected_files()` method that confirms, shows progress, calls the existing batch delete API, and preserves failed selections.

```javascript
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
			frappe.msgprint({
				title: __("部分附件删除失败"),
				message: unmatched
					.map((url) => `<div>${frappe.utils.escape_html(decodeURIComponent(url.split("/").pop()))}: ${__("文件不存在")}</div>`)
					.join(""),
				indicator: "orange",
			});
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
```

- [ ] **Step 4: Reconcile field value from delete results**

Implement a completion handler that removes successful URLs, preserves failed URLs, updates the field, refreshes the UI, and saves the form.

```javascript
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

	this.selected_files = new Set(failed_urls);
	if (!failed_urls.length) {
		this.is_bulk_delete_mode = false;
	}

	await this.parse_validate_and_set_in_model(JSON.stringify(next_urls));
	this.refresh();
	this.frm.doc.docstatus == 1 ? this.frm.save("Update") : this.frm.save();

	frappe.show_progress(progress_title, 100, 100, __("删除完成"), true);
}
```

- [ ] **Step 5: Add partial-failure messaging**

Mirror the sidebar’s Chinese messages for partial failures after save is triggered.

```javascript
if (failed_rows.length || unmatched.length) {
	const combined_failures = [
		...failed_rows.map((row) => ({
			file_name: row.file_name || row.file_id,
			error: row.error || __("未知错误"),
		})),
		...unmatched.map((url) => ({
			file_name: decodeURIComponent(url.split("/").pop()),
			error: __("文件不存在"),
		})),
	];

	frappe.msgprint({
		title: __("部分附件删除失败"),
		message: combined_failures.map((row) => `<div>${frappe.utils.escape_html(row.file_name)}: ${frappe.utils.escape_html(row.error)}</div>`).join(""),
		indicator: "orange",
	});
} else {
	frappe.show_alert(__("已删除 {0} 个附件", [deleted_urls.length]));
}
```

- [ ] **Step 6: Run focused backend regression**

Run:

```bash
bench --site sys.autohaina.com run-tests --module frappe.desk.form.test_form
```

Expected:

- PASS
- Existing `remove_attachments` behavior remains unchanged

- [ ] **Step 7: Commit**

```bash
git add frappe/public/js/frappe/form/controls/attach.js
git commit -m "feat: batch delete files from multiple attach fields"
```

### Task 4: Final verification and asset refresh

**Files:**
- Modify: `cypress/integration/control_attach.js`
- Modify: `frappe/public/js/frappe/form/controls/attach.js`

- [ ] **Step 1: Re-run the target test file**

Run:

```bash
npx cypress run --config video=false --spec cypress/integration/control_attach.js
```

Expected:

- PASS on environments with Cypress dependencies installed
- In this environment, if it still fails before execution because `libasound.so.2` is missing, record that as an environment limitation in the final handoff

- [ ] **Step 2: Rebuild assets**

Run:

```bash
bench build --apps frappe
```

Expected:

- PASS
- Updated `form.bundle.*` includes the `ControlAttach` changes

- [ ] **Step 3: Clear caches for active sites**

Run:

```bash
bench --site hn.autohaina.com clear-cache
bench --site sys.autohaina.com clear-cache
```

Expected:

- PASS with no errors

- [ ] **Step 4: Manual verification checklist**

Perform these checks in the browser:

```text
1. Open a doctype containing an Attach field with options=multiple.
2. Upload three files into the field.
3. Confirm the field shows a “批量删除” button.
4. Enter selection mode and confirm “已选择 0 项 / 删除 / 取消”.
5. Select two files and delete them.
6. Confirm “正在删除附件” progress dialog appears.
7. Confirm the field list drops from 3 files to 1 file.
8. Confirm sidebar attachments also drop to 1 file.
9. Confirm failed deletions, if any, stay selected and remain in the field value.
```

- [ ] **Step 5: Commit**

```bash
git add cypress/integration/control_attach.js frappe/public/js/frappe/form/controls/attach.js
git commit -m "test: verify bulk delete for multiple attach fields"
```
