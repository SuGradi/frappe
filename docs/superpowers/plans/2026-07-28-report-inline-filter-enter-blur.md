# Report View Inline Filter Enter And Blur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every DocType Report View header filter query the complete permitted dataset only on Enter or input blur.

**Architecture:** Keep the existing server-filter construction, accepted-state comparison, paging reset, and stale-response guard. Replace only the debounced delegated `input` event with immediate delegated `keydown` and `blur` events sharing the existing apply function.

**Tech Stack:** Frappe v15 JavaScript, jQuery event delegation, Node.js built-in test runner, esbuild.

---

## File Structure

- Modify `frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js`: specify the Enter/blur event contract and reject automatic debounce behavior.
- Modify `frappe/public/js/frappe/views/reports/report_view.js`: bind Enter and blur to the existing server-backed filter application path.

### Task 1: Change The Report Filter Trigger

**Files:**
- Modify: `frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js:199-241`
- Modify: `frappe/public/js/frappe/views/reports/report_view.js:524-547`

- [ ] **Step 1: Write the failing source integration test**

Replace the current debounce assertion with concrete event assertions:

```javascript
assert.doesNotMatch(report_view_source, /frappe\.utils\.debounce\([\s\S]*?500\s*\)/);
assert.doesNotMatch(report_view_source, /\.on\("input\.report-view-inline-filter"/);
assert.match(report_view_source, /\.off\("\.report-view-inline-filter"\)/);
assert.match(
	report_view_source,
	/\.on\("keydown\.report-view-inline-filter",\s*"\.dt-filter",[\s\S]*?event\.key !== "Enter"[\s\S]*?event\.preventDefault\(\)[\s\S]*?this\.apply_inline_filter_values\(\)/
);
assert.match(
	report_view_source,
	/\.on\("blur\.report-view-inline-filter",\s*"\.dt-filter",[\s\S]*?this\.apply_inline_filter_values\(\)/
);
```

Keep the existing assertions for server filter composition, `start = 0`, refresh generation, permissions, count, and search parameters.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
```

Expected: one source integration test fails because the implementation still uses `frappe.utils.debounce(..., 500)` and the delegated `input` event.

- [ ] **Step 3: Implement the minimal Enter/blur handlers**

Replace `bind_inline_filter_events()` with the same state application body as a non-debounced function and new delegated handlers:

```javascript
bind_inline_filter_events() {
	this.apply_inline_filter_values ||= () => {
		const next = report_inline_filters.build_report_inline_filters(
			this.datatable?.columnmanager.getAppliedFilters() || {},
			this.datatable?.getColumns() || []
		);
		const changed =
			JSON.stringify(next.values) !== JSON.stringify(this.inline_filter_values || {});

		this.inline_filter_values = next.values;
		this.restore_inline_filter_values();
		if (!changed) return;

		this.inline_filters = next.filters;
		this.start = 0;
		this.refresh();
	};

	this.$datatable_wrapper
		.off(".report-view-inline-filter")
		.on("keydown.report-view-inline-filter", ".dt-filter", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			this.apply_inline_filter_values();
		})
		.on("blur.report-view-inline-filter", ".dt-filter", () => {
			this.apply_inline_filter_values();
		});
}
```

The existing `changed` comparison is the duplicate-request guard when Enter is followed by blur.

- [ ] **Step 4: Run focused and adjacent tests and verify GREEN**

Run:

```bash
node --test frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
node --check frappe/public/js/frappe/views/reports/report_view.js
git diff --check
```

Expected: all inline-filter tests pass, syntax check exits zero, and no whitespace errors are reported.

- [ ] **Step 5: Commit the behavior change**

```bash
git add frappe/public/js/frappe/views/reports/report_view.js \
  frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
git commit -m "修复：报表筛选改为回车或失焦查询"
```

### Task 2: Build And Activate On Sys

**Files:**
- Runtime asset: `sites/assets/frappe/dist/js/report.bundle.*.js`
- Update: `/www/haina/frappe-bench/task_plan.md`
- Update: `/www/haina/frappe-bench/findings.md`
- Update: `/www/haina/frappe-bench/progress.md`

- [ ] **Step 1: Run fresh pre-build verification**

Run the focused Node test, `node --check`, `git diff --check`, and confirm no Frappe test process is running. Expected: all commands exit zero and no test process is listed.

- [ ] **Step 2: Build Frappe assets**

From `/www/haina/frappe-bench`, run:

```bash
bench build --app frappe
```

Expected: exit zero and a report bundle referenced by `sites/assets/assets.json`.

- [ ] **Step 3: Verify the built report bundle contract**

Resolve the current report bundle and require:

- delegated `keydown.report-view-inline-filter` and `blur.report-view-inline-filter` handlers;
- an Enter key check and `preventDefault()`;
- no delegated `input.report-view-inline-filter` handler;
- no 500 ms debounce around `apply_inline_filter_values`.

- [ ] **Step 4: Activate and verify sys runtime**

Run:

```bash
bench --site sys.autohaina.com clear-cache
bench restart
```

Require all supervisor processes RUNNING, `https://sys.autohaina.com/api/method/ping` HTTP 200, and the report bundle public URL HTTP 200. Do not query, migrate, or otherwise operate on `hn.autohaina.com`.

- [ ] **Step 5: Record completion evidence**

Mark Phase 17 complete in the bench planning files with the commit, test count, bundle filename, source/bundle trigger checks, process health, and HTTPS results.
