# Bulk Attachment Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a batch-delete flow to the form sidebar attachments section so users can enter selection mode, choose multiple attachments, and permanently delete the corresponding `File` records and physical file data in one action.

**Architecture:** Keep the existing single-delete flow intact and layer a new batch-delete path on top of it. The frontend adds a selection mode and a new batch-delete action bar in the sidebar, while the backend adds one bulk endpoint that validates document permissions, confirms each `File` belongs to the current document, and deletes each file via `frappe.delete_doc("File", fid)` so core file cleanup logic still runs.

**Tech Stack:** Frappe Desk form sidebar JavaScript, Jinja sidebar template, SCSS, Cypress UI tests, Python `FrappeTestCase` tests, whitelisted desk form API.

---

## File Structure

- Modify: `frappe/frappe/desk/form/utils.py`
  Adds `remove_attachments` and a small permission helper for batch delete.
- Modify: `frappe/frappe/desk/form/test_form.py`
  Adds backend tests for batch deletion success, mixed-document rejection, and partial failure handling.
- Modify: `frappe/frappe/public/js/frappe/form/templates/form_sidebar.html`
  Adds the batch-delete icon button and the selection toolbar container next to attachment actions.
- Modify: `frappe/frappe/public/js/frappe/form/sidebar/attachments.js`
  Adds selection-mode state, checkbox rendering, exact-by-`File.name` selection, batch API call, and result handling.
- Modify: `frappe/frappe/public/scss/desk/sidebar.scss`
  Styles the new batch-delete icon, selection toolbar, and checkbox row layout without disturbing default sidebar behavior.
- Modify: `frappe/cypress/integration/sidebar.js`
  Adds UI coverage for entering selection mode, choosing multiple attachments, canceling selection mode, and batch deletion.

### Task 1: Implement and Verify the Backend Batch-Delete API

**Files:**
- Modify: `frappe/frappe/desk/form/test_form.py`
- Modify: `frappe/frappe/desk/form/utils.py`

- [ ] **Step 1: Write the failing backend tests**

Add imports and test helpers to `frappe/frappe/desk/form/test_form.py`:

```python
import json
from unittest.mock import patch

import frappe
from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes
from frappe.desk.form.utils import remove_attachments
from frappe.tests.utils import FrappeTestCase


def make_test_doc():
	doc = frappe.new_doc("ToDo")
	doc.description = "Bulk attachment delete test"
	doc.save()
	return doc
```

Extend `TestForm` with exact-attachment tests:

```python
class TestForm(FrappeTestCase):
	def _make_attachment(self, doc, file_name, content):
		return frappe.get_doc(
			{
				"doctype": "File",
				"file_name": file_name,
				"attached_to_doctype": doc.doctype,
				"attached_to_name": doc.name,
				"content": content,
			}
		).insert()

	def test_remove_attachments_deletes_multiple_files(self):
		doc = make_test_doc()
		file_1 = self._make_attachment(doc, "bulk-delete-1.txt", "one")
		file_2 = self._make_attachment(doc, "bulk-delete-2.txt", "two")

		result = remove_attachments(doc.doctype, doc.name, json.dumps([file_1.name, file_2.name]))

		self.assertCountEqual(result["deleted"], [file_1.name, file_2.name])
		self.assertEqual(result["failed"], [])
		self.assertFalse(frappe.db.exists("File", file_1.name))
		self.assertFalse(frappe.db.exists("File", file_2.name))

	def test_remove_attachments_rejects_files_from_other_documents(self):
		doc = make_test_doc()
		other_doc = make_test_doc()
		file_1 = self._make_attachment(doc, "same-doc.txt", "one")
		other_file = self._make_attachment(other_doc, "other-doc.txt", "two")

		result = remove_attachments(doc.doctype, doc.name, json.dumps([file_1.name, other_file.name]))

		self.assertEqual(result["deleted"], [file_1.name])
		self.assertEqual(result["failed"][0]["file_id"], other_file.name)
		self.assertTrue(frappe.db.exists("File", other_file.name))

	def test_remove_attachments_returns_partial_failures(self):
		doc = make_test_doc()
		file_1 = self._make_attachment(doc, "partial-1.txt", "one")
		file_2 = self._make_attachment(doc, "partial-2.txt", "two")

		original_delete_doc = frappe.delete_doc

		def fake_delete_doc(doctype, name, *args, **kwargs):
			if name == file_2.name:
				raise frappe.ValidationError("boom")
			return original_delete_doc(doctype, name, *args, **kwargs)

		with patch("frappe.delete_doc", side_effect=fake_delete_doc):
			result = remove_attachments(doc.doctype, doc.name, json.dumps([file_1.name, file_2.name]))

		self.assertEqual(result["deleted"], [file_1.name])
		self.assertEqual(result["failed"][0]["file_id"], file_2.name)
		self.assertIn("boom", result["failed"][0]["error"])
		self.assertFalse(frappe.db.exists("File", file_1.name))
		self.assertTrue(frappe.db.exists("File", file_2.name))
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run:

```bash
cd /www/haina/frappe-bench
bench --site sys.autohaina.com run-tests --module frappe.desk.form.test_form
```

Expected:

```text
FAIL TestForm.test_remove_attachments_deletes_multiple_files
AttributeError or TypeError because remove_attachments is missing or has the wrong signature
```

- [ ] **Step 3: Write the minimal backend implementation**

Add a permission helper and the new endpoint to `frappe/frappe/desk/form/utils.py`:

```python
def _validate_attachment_delete_permission(doc):
	if not doc.has_permission("write"):
		raise frappe.PermissionError

	if not doc.meta.protect_attached_files:
		return

	if doc.docstatus == 0:
		return

	if doc.docstatus == 2 and doc.has_permission("delete"):
		return

	raise frappe.PermissionError


@frappe.whitelist(methods=["DELETE", "POST"])
def remove_attachments(dt: str | None = None, dn: str | None = None, file_ids=None):
	dt = dt or frappe.form_dict.get("dt")
	dn = dn or frappe.form_dict.get("dn")
	file_ids = file_ids or frappe.form_dict.get("file_ids") or "[]"
	file_ids = frappe.parse_json(file_ids)

	doc = frappe.get_doc(dt, dn)
	_validate_attachment_delete_permission(doc)

	files = {
		row.name: row
		for row in frappe.get_all(
			"File",
			fields=["name", "file_name", "attached_to_doctype", "attached_to_name"],
			filters={"name": ["in", file_ids]},
		)
	}

	deleted = []
	failed = []

	for file_id in file_ids:
		file_doc = files.get(file_id)
		if not file_doc:
			failed.append({"file_id": file_id, "file_name": None, "error": "File not found"})
			continue

		if (
			file_doc.attached_to_doctype != dt
			or file_doc.attached_to_name != str(dn)
		):
			failed.append(
				{
					"file_id": file_id,
					"file_name": file_doc.file_name,
					"error": "File is not attached to the requested document",
				}
			)
			continue

		try:
			frappe.delete_doc("File", file_id)
			deleted.append(file_id)
		except Exception:
			failed.append(
				{
					"file_id": file_id,
					"file_name": file_doc.file_name,
					"error": frappe.get_traceback(with_context=False).splitlines()[-1],
				}
			)

	return {"deleted": deleted, "failed": failed}
```

- [ ] **Step 4: Run the backend tests to verify they pass**

Run:

```bash
cd /www/haina/frappe-bench
bench --site sys.autohaina.com run-tests --module frappe.desk.form.test_form
```

Expected:

```text
PASS frappe.desk.form.test_form
```

- [ ] **Step 5: Commit the backend batch-delete API**

Run:

```bash
cd /www/haina/frappe-bench/apps/frappe
git add frappe/desk/form/utils.py frappe/desk/form/test_form.py
git commit -m "feat: add bulk attachment delete api"
```

### Task 2: Add Failing Cypress Coverage for Sidebar Selection Mode

**Files:**
- Modify: `frappe/cypress/integration/sidebar.js`

- [ ] **Step 1: Write the failing sidebar UI tests**

Extend `frappe/cypress/integration/sidebar.js` with a helper that uploads a small set of files and a new batch-delete test:

```javascript
it("supports batch deleting attachments from the sidebar", () => {
	cy.call("frappe.tests.ui_test_helpers.create_todo", {
		description: "Sidebar Bulk Delete ToDo",
	}).then((todo) => {
		cy.visit(`/app/todo/${todo.message.name}`);

		attach_file("cypress/fixtures/sample_attachments/attachment-2.txt");
		attach_file("cypress/fixtures/sample_attachments/attachment-3.txt");
		attach_file("cypress/fixtures/sample_attachments/attachment-4.txt");

		cy.get(".bulk-delete-attachment-btn").click();
		cy.get(".attachment-bulk-actions").should("be.visible");
		cy.get(".attachment-select-row input[type='checkbox']").should("have.length", 3);

		cy.get(".attachment-select-row input[type='checkbox']").eq(0).check({ force: true });
		cy.get(".attachment-select-row input[type='checkbox']").eq(1).check({ force: true });
		cy.get(".attachment-selection-count").should("contain", "2");

		cy.get(".attachment-delete-selected-btn").click();
		cy.findByRole("button", { name: "Yes" }).click();

		cy.get(".attachment-row").should("have.length", 1);
		cy.get(".attachment-bulk-actions").should("not.be.visible");
	});
});

it("cancels sidebar attachment selection mode", () => {
	cy.call("frappe.tests.ui_test_helpers.create_todo", {
		description: "Sidebar Bulk Delete Cancel ToDo",
	}).then((todo) => {
		cy.visit(`/app/todo/${todo.message.name}`);

		attach_file("cypress/fixtures/sample_attachments/attachment-5.txt");

		cy.get(".bulk-delete-attachment-btn").click();
		cy.get(".attachment-select-row input[type='checkbox']").check({ force: true });
		cy.get(".attachment-cancel-selection-btn").click();

		cy.get(".attachment-bulk-actions").should("not.be.visible");
		cy.get(".attachment-select-row input[type='checkbox']").should("not.exist");
	});
});
```

- [ ] **Step 2: Run the Cypress spec to verify it fails**

Run:

```bash
cd /www/haina/frappe-bench/apps/frappe
CI=1 npx cypress run --spec cypress/integration/sidebar.js
```

Expected:

```text
FAIL because .bulk-delete-attachment-btn and selection-mode controls do not exist yet
```

- [ ] **Step 3: Record the selectors and UI contract in comments before implementation**

At the top of the new test block, add a short comment describing the intended DOM hooks so implementation and tests stay aligned:

```javascript
// Batch delete selectors:
// .bulk-delete-attachment-btn
// .attachment-bulk-actions
// .attachment-selection-count
// .attachment-delete-selected-btn
// .attachment-cancel-selection-btn
// .attachment-select-row
```

- [ ] **Step 4: Re-run the Cypress spec to keep the failure signal fresh**

Run:

```bash
cd /www/haina/frappe-bench/apps/frappe
CI=1 npx cypress run --spec cypress/integration/sidebar.js
```

Expected:

```text
FAIL for the same missing batch-delete UI selectors
```

- [ ] **Step 5: Leave the failing test changes in place for Task 3**

Do not commit a red-state frontend diff. Keep the Cypress test changes in the working tree so Task 3 can implement against them immediately.

```bash
cd /www/haina/frappe-bench/apps/frappe
git diff -- cypress/integration/sidebar.js
```

### Task 3: Implement Sidebar Selection Mode and Batch Deletion

**Files:**
- Modify: `frappe/frappe/public/js/frappe/form/templates/form_sidebar.html`
- Modify: `frappe/frappe/public/js/frappe/form/sidebar/attachments.js`
- Modify: `frappe/frappe/public/scss/desk/sidebar.scss`

- [ ] **Step 1: Update the sidebar template with the new action controls**

Change the attachment action block in `frappe/frappe/public/js/frappe/form/templates/form_sidebar.html` to add the batch-delete icon and hidden toolbar:

```html
<li class="attachments-actions">
	<span class="form-sidebar-items">
		<span>
			<svg class="es-icon ml-0 icon-sm">
				<use href="#es-line-attachment"></use>
			</svg>
			<a class="pill-label ellipsis explore-link">
				{%= __("Attachments") %}
			</a>
		</span>
		<span class="attachment-action-buttons">
			<button class="bulk-delete-attachment-btn btn btn-link icon-btn">
				<svg class="es-icon icon-sm"><use href="#es-line-delete"></use></svg>
			</button>
			<button class="add-attachment-btn btn btn-link icon-btn">
				<svg class="es-icon icon-sm"><use href="#es-line-add"></use></svg>
			</button>
		</span>
		<span class="attachment-bulk-actions hidden">
			<span class="attachment-selection-count">0</span>
			<button class="attachment-delete-selected-btn btn btn-sm btn-danger">
				{%= __("Delete Selected") %}
			</button>
			<button class="attachment-cancel-selection-btn btn btn-sm btn-secondary">
				{%= __("Cancel") %}
			</button>
		</span>
	</span>
</li>
```

- [ ] **Step 2: Add the selection-mode state and batch API flow**

Extend `frappe/frappe/public/js/frappe/form/sidebar/attachments.js` with exact-by-id selection state and the new batch-delete call:

```javascript
constructor(opts) {
	$.extend(this, opts);
	this.attachments_page_length = 10;
	this.show_all_attachments = false;
	this.is_bulk_delete_mode = false;
	this.selected_attachments = new Set();
	this.make();
}

setup_bulk_delete_actions() {
	this.parent.find(".bulk-delete-attachment-btn").on("click", () => {
		this.enter_bulk_delete_mode();
	});

	this.parent.find(".attachment-cancel-selection-btn").on("click", () => {
		this.exit_bulk_delete_mode();
	});

	this.parent.find(".attachment-delete-selected-btn").on("click", () => {
		const fileids = [...this.selected_attachments];
		if (!fileids.length) return;

		frappe.confirm(
			__("This will permanently delete the selected files. Continue?"),
			() => this.remove_attachments(fileids)
		);
	});
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
		callback: ({ message }) => {
			const deleted = message.deleted || [];
			const failed = message.failed || [];

			deleted.forEach((fileid) => this.remove_fileid(fileid));
			failed.forEach((row) => this.selected_attachments.add(row.file_id));
			deleted.forEach((fileid) => this.selected_attachments.delete(fileid));

			this.frm.sidebar.reload_docinfo();

			if (!failed.length) {
				frappe.show_alert(__("Deleted {0} attachments", [deleted.length]));
				this.exit_bulk_delete_mode(false);
			} else {
				frappe.msgprint({
					title: __("Some attachments could not be deleted"),
					message: failed.map((row) => `${row.file_name || row.file_id}: ${row.error}`).join("<br>"),
					indicator: "orange",
				});
				this.refresh();
			}
		},
	});
}
```

- [ ] **Step 3: Render exact attachment rows with checkboxes in selection mode**

Update row rendering in `frappe/frappe/public/js/frappe/form/sidebar/attachments.js` so rows are not deduplicated by file name and selection mode adds checkbox controls:

```javascript
render_attachments(attachments) {
	let attachments_to_render = attachments;

	if (!this.show_all_attachments && attachments.length > this.attachments_page_length) {
		const start = attachments.length - this.attachments_page_length;
		attachments_to_render = attachments.slice(start, attachments.length);
	}

	attachments_to_render.forEach((attachment) => this.add_attachment(attachment));
}

add_attachment(attachment) {
	const row = $('<li class="attachment-row">');
	if (this.is_bulk_delete_mode) {
		const checkbox = $(`
			<label class="attachment-select-row">
				<input type="checkbox" ${this.selected_attachments.has(attachment.name) ? "checked" : ""}>
			</label>
		`);

		checkbox.find("input").on("change", (event) => {
			this.toggle_attachment_selection(attachment.name, event.currentTarget.checked);
		});

		row.append(checkbox);
	}

	const pill = frappe.get_data_pill(file_label, fileid, this.is_bulk_delete_mode ? null : remove_action, icon);
	row.append(pill).insertAfter(this.add_attachment_wrapper);
}

render_actions_state() {
	const action_buttons = this.parent.find(".attachment-action-buttons");
	const bulk_actions = this.parent.find(".attachment-bulk-actions");

	action_buttons.toggleClass("hidden", this.is_bulk_delete_mode);
	bulk_actions.toggleClass("hidden", !this.is_bulk_delete_mode);
	this.parent.find(".attachment-selection-count").text(
		__("Selected {0}", [this.selected_attachments.size])
	);
}
```

- [ ] **Step 4: Add sidebar styles and run the UI tests to verify they pass**

Add focused styles to `frappe/frappe/public/scss/desk/sidebar.scss`:

```scss
.attachment-action-buttons,
.attachment-bulk-actions {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.attachment-select-row {
	display: inline-flex;
	align-items: center;
	margin-right: var(--margin-xs);
}

.attachment-bulk-actions.hidden,
.attachment-action-buttons.hidden {
	display: none;
}
```

Run:

```bash
cd /www/haina/frappe-bench/apps/frappe
CI=1 npx cypress run --spec cypress/integration/sidebar.js
```

Expected:

```text
PASS cypress/integration/sidebar.js
```

- [ ] **Step 5: Commit the sidebar selection-mode implementation**

Run:

```bash
cd /www/haina/frappe-bench/apps/frappe
git add \
	frappe/public/js/frappe/form/templates/form_sidebar.html \
	frappe/public/js/frappe/form/sidebar/attachments.js \
	frappe/public/scss/desk/sidebar.scss \
	cypress/integration/sidebar.js
git commit -m "feat: add sidebar bulk attachment delete"
```

### Task 4: Run Full Verification and Capture Any Gaps

**Files:**
- No code changes required unless verification exposes a bug

- [ ] **Step 1: Run the targeted backend and frontend verification commands**

Run:

```bash
cd /www/haina/frappe-bench
bench --site sys.autohaina.com run-tests --module frappe.desk.form.test_form
cd /www/haina/frappe-bench/apps/frappe
CI=1 npx cypress run --spec cypress/integration/sidebar.js
```

Expected:

```text
PASS frappe.desk.form.test_form
PASS cypress/integration/sidebar.js
```

- [ ] **Step 2: Run a manual smoke check against the live sidebar flow**

Verify in the browser:

```text
1. Open a ToDo with at least three attachments.
2. Confirm the batch-delete icon appears to the left of the add attachment icon.
3. Enter selection mode and confirm checkboxes appear.
4. Select two files and delete them.
5. Confirm the sidebar exits selection mode on full success.
6. Re-enter selection mode, select one file, then cancel.
7. Confirm the checkbox state clears and the add attachment button returns.
```

- [ ] **Step 3: If verification finds a bug, fix the smallest issue and re-run only the affected checks**

Use this decision table:

```text
- Backend API issue -> re-run bench --site sys.autohaina.com run-tests --module frappe.desk.form.test_form
- Sidebar DOM/state issue -> re-run CI=1 npx cypress run --spec cypress/integration/sidebar.js
- Styling-only issue -> repeat manual smoke check after rebuilding assets if needed
```

- [ ] **Step 4: Confirm the final diff only contains the intended files**

Run:

```bash
cd /www/haina/frappe-bench/apps/frappe
git status --short
git diff --stat HEAD
```

Expected:

```text
No unexpected tracked files are modified beyond the intended implementation files and any known pre-existing user changes
```

- [ ] **Step 5: Commit any final verification fixups**

Run:

```bash
cd /www/haina/frappe-bench/apps/frappe
git add -A
git commit -m "test: verify bulk attachment delete flow"
```
