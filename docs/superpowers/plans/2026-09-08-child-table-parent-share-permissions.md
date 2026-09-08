# Child Table Parent Share Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow permission-level-zero child fields when the current user reads the specified parent DocType through document sharing.

**Architecture:** Keep Report View and database query security checks unchanged. Correct the shared-document fallback in `Meta.get_permitted_fieldnames()` so child metadata checks `parenttype` shares, which is the same parent permission context already used for role permissions.

**Tech Stack:** Python, Frappe permissions, unittest/FrappeTestCase

---

### Task 1: Inherit Parent Shares for Child Field Permissions

**Files:**
- Modify: `frappe/model/meta.py:618`
- Test: `frappe/tests/test_model_utils.py`

- [x] **Step 1: Write the failing regression test**

Import `patch` from `unittest.mock`. In `TestModelUtils.test_get_permitted_fields`, mock `frappe.share.get_shared` so only `Installed Applications` reports a shared document, then assert that `app_name` from child DocType `Installed Application` is permitted when `parenttype="Installed Applications"` is supplied:

```python
def shared_parent_only(doctype, *_args, **_kwargs):
	return ["Installed Applications"] if doctype == "Installed Applications" else []

with set_user("Guest"), patch("frappe.share.get_shared", side_effect=shared_parent_only):
	self.assertIn(
		"app_name",
		get_permitted_fields("Installed Application", parenttype="Installed Applications"),
	)
```

- [x] **Step 2: Run the test and verify the regression is exposed**

Run:

```bash
bench --site sys.autohaina.com run-tests --app frappe --module frappe.tests.test_model_utils --case TestModelUtils
```

Expected: three tests run, with `test_get_permitted_fields` failing because the current implementation asks for `Installed Application` shares and excludes `app_name`.

- [x] **Step 3: Implement the minimal permission correction**

In `Meta.get_permitted_fieldnames()`, select the parent DocType only for child metadata with an explicit parent context:

```python
shared_doctype = parenttype if self.istable and parenttype else self.name
if frappe.share.get_shared(shared_doctype, user, rights=[permission_type], limit=1):
	permlevel_access.add(0)
```

- [x] **Step 4: Run focused tests**

Run:

```bash
bench --site sys.autohaina.com run-tests --app frappe --module frappe.tests.test_model_utils
bench --site sys.autohaina.com run-tests --app frappe --module frappe.tests.test_reportview --case TestReportviewFilterPermissions
```

Expected: both focused runs pass with no failures. Run the complete `frappe.tests.test_reportview` module on modified and baseline source when checking unrelated report regressions.

- [x] **Step 5: Verify the affected sys user without writing data**

Under `s15159320575@qq.com`, assert that `get_permitted_fields("xunjia_items", parenttype="xunjia")` contains `vehicles` and `vehicle_price`, validate the Report View `vehicles` filter, and execute the saved report field query to confirm returned `vehicle_price` values match stored child rows.

- [x] **Step 6: Review and commit**

Run `git diff --check`, inspect the scoped diff, and commit only the plan, test, and permission implementation:

```bash
git add docs/superpowers/plans/2026-09-08-child-table-parent-share-permissions.md frappe/model/meta.py frappe/tests/test_model_utils.py
git commit -m "fix: inherit parent shares for child fields"
```
