# Report View Server-Side Inline Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every DocType Report View inline column filter query the complete permitted dataset before pagination.

**Architecture:** Add a small dependency-free filter translator beside Report View and load it into the report bundle. Report View will disable DataTable's local row filtering, debounce input for 500 ms, append translated conditions to request filters, preserve input state across table refreshes, and guard rendering with a monotonically increasing refresh generation.

**Tech Stack:** Frappe v15 JavaScript, frappe-datatable, jQuery event delegation, Node.js built-in test runner, esbuild.

---

## File Structure

- Create `frappe/public/js/frappe/views/reports/report_view_inline_filters.js`: pure filter parsing, column mapping, accepted input state, and row-index helpers with CommonJS exports for tests.
- Create `frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js`: focused Node tests for all supported expressions, child fields, unsupported columns, and filter composition.
- Modify `frappe/public/js/frappe/views/reports/report_view.js`: load the helper, bind server-backed inline input, append filters to requests, preserve input state, reset paging, and ignore stale responses.

### Task 1: Filter Translation Module

**Files:**
- Create: `frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js`
- Create: `frappe/public/js/frappe/views/reports/report_view_inline_filters.js`

- [ ] **Step 1: Write failing expression and column-mapping tests**

Create tests using `node:test` and `node:assert/strict`. Assert these concrete results:

```javascript
assert.deepEqual(parse_inline_filter_expression("ABC"), ["like", "%ABC%"]);
assert.deepEqual(parse_inline_filter_expression(" > 10 "), [">", "10"]);
assert.deepEqual(parse_inline_filter_expression("!=0"), ["!=", "0"]);
assert.deepEqual(parse_inline_filter_expression("2026-01-01:2026-01-31"), [
	"between",
	["2026-01-01", "2026-01-31"],
]);

const result = build_report_inline_filters({ 1: "G-2607", 2: "LVR" }, [
	{ id: "_checkbox" },
	{ field: "name", docfield: { parent: "gendan" } },
	{ field: "vehicle_vin", docfield: { parent: "gendan_vehicle_item" } },
]);
assert.deepEqual(result.filters, [
	["gendan", "name", "like", "%G-2607%"],
	["gendan_vehicle_item", "vehicle_vin", "like", "%LVR%"],
]);
```

Also assert that aggregate, virtual, checkbox, blank, and malformed operator inputs are excluded; accepted input values retain their original column indexes; and `append_report_inline_filters()` does not mutate the standard filter array.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node --test frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
```

Expected: FAIL because `report_view_inline_filters.js` does not exist.

- [ ] **Step 3: Implement the pure helper**

Use the established browser/CommonJS wrapper pattern:

```javascript
(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	root.frappe = root.frappe || {};
	root.frappe.views = root.frappe.views || {};
	root.frappe.views.report_inline_filters = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
	function parse_inline_filter_expression(input) {
		const text = String(input ?? "").trim();
		if (!text) return null;

		const range = text.split(":").map((value) => value.trim());
		const is_range_value = (value) =>
			/^-?\d+(?:\.\d+)?$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
		if (range.length === 2 && range.every(is_range_value)) {
			return ["between", range];
		}

		for (const operator of ["!=", ">", "<", "="]) {
			if (text.startsWith(operator)) {
				const value = text.slice(operator.length).trim();
				return value ? [operator, value] : null;
			}
		}

		return ["like", `%${text}%`];
	}

	function build_report_inline_filters(values, columns) {
		const filters = [];
		const accepted_values = {};

		for (const [column_index, input] of Object.entries(values || {})) {
			const column = columns?.[Number(column_index)];
			const fieldname = column?.field;
			const doctype = column?.docfield?.parent;
			if (
				!fieldname ||
				!doctype ||
				fieldname === "_aggregate_column" ||
				column.docfield.is_virtual
			) {
				continue;
			}

			const expression = parse_inline_filter_expression(input);
			if (!expression) continue;

			accepted_values[column_index] = input;
			filters.push([doctype, fieldname, expression[0], expression[1]]);
		}

		return { filters, values: accepted_values };
	}

	function append_report_inline_filters(standard_filters, inline_filters) {
		return [...standard_filters, ...inline_filters];
	}

	function get_all_row_indices(rows) {
		return rows.map((row) => row.meta.rowIndex);
	}

	return {
		append_report_inline_filters,
		build_report_inline_filters,
		get_all_row_indices,
		parse_inline_filter_expression,
	};
});
```

Reject `_aggregate_column`, virtual fields, missing `field`/`docfield.parent`, and empty operands. Recognize ranges only when both endpoints are numeric or ISO dates so URLs and ordinary colon-containing text remain `like` searches. Preserve numeric/date operands as trimmed strings so Frappe's database query layer performs field-aware conversion.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run the same Node command. Expected: all tests PASS with no warnings.

- [ ] **Step 5: Commit the helper and tests**

```bash
git add frappe/public/js/frappe/views/reports/report_view_inline_filters.js \
  frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
git commit -m "feat: add report inline filter translation"
```

### Task 2: Report View Server Query Integration

**Files:**
- Modify: `frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js`
- Modify: `frappe/public/js/frappe/views/reports/report_view.js`

- [ ] **Step 1: Add failing state and paging tests**

Extend the helper test to specify the state transition consumed by Report View:

```javascript
const next = build_report_inline_filters({ 1: "HN260" }, columns);
assert.deepEqual(next.values, { 1: "HN260" });
assert.deepEqual(append_report_inline_filters([["gendan", "company", "=", "海纳"]], next.filters), [
	["gendan", "company", "=", "海纳"],
	["gendan", "name", "like", "%HN260%"],
]);
assert.deepEqual(build_report_inline_filters({}, columns), { filters: [], values: {} });
```

Add a source-level integration assertion that Report View configures DataTable with `filterRows: report_inline_filters.get_all_row_indices`, uses a 500 ms debounced delegated input handler, resets `start = 0`, overrides `get_filters_for_args()` to append inline filters, and keeps the table header visible when an active server filter returns zero rows so the user can clear it.

- [ ] **Step 2: Run the test to verify RED**

Run the focused Node test. Expected: helper assertions pass, source integration assertion fails because Report View still uses local DataTable filtering.

- [ ] **Step 3: Integrate the helper into Report View**

At the top of `report_view.js`, load the helper for the report bundle:

```javascript
import "./report_view_inline_filters.js";
const report_inline_filters = frappe.views.report_inline_filters;
```

In `setup_datatable()`, configure the DataTable callback so it always keeps all server-returned rows visible:

```javascript
filterRows: report_inline_filters.get_all_row_indices,
```

After creating DataTable, bind one delegated `input.report-view-inline-filter` handler on `$datatable_wrapper`. Debounce it by 500 ms, read `columnmanager.getAppliedFilters()`, translate against `datatable.getColumns()`, set `inline_filter_values` and `inline_filters`, reset `start` to zero, and call `refresh()` only when accepted filter state changed.

Add these methods with single responsibilities:

```javascript
get_filters_for_args() {
	return report_inline_filters.append_report_inline_filters(
		super.get_filters_for_args(),
		this.inline_filters || []
	);
}

bind_inline_filter_events() {
	this.apply_inline_filter_values ||= frappe.utils.debounce(() => {
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
	}, 500);

	this.$datatable_wrapper
		.off("input.report-view-inline-filter")
		.on("input.report-view-inline-filter", ".dt-filter", () => {
			this.apply_inline_filter_values();
		});
}

restore_inline_filter_values() {
	const values = this.inline_filter_values || {};
	this.$datatable_wrapper.find(".dt-filter").each((_index, input) => {
		input.value = values[input.dataset.colIndex] || "";
	});
}

has_inline_filters() {
	return Boolean(this.inline_filters?.length);
}

toggle_result_area() {
	super.toggle_result_area();
	if (this.has_inline_filters()) {
		this.$result.show();
		this.$no_result.hide();
	}
}
```

Call `restore_inline_filter_values()` after both `datatable.refresh()` and initial DataTable construction. Allow `render()` to refresh an empty DataTable when `has_inline_filters()` is true. Unsupported filter entries disappear because only `inline_filter_values` are restored.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run the focused Node test. Expected: all tests PASS.

- [ ] **Step 5: Commit Report View integration**

```bash
git add frappe/public/js/frappe/views/reports/report_view.js \
  frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
git commit -m "feat: query all report rows from inline filters"
```

### Task 3: Latest Refresh Wins

**Files:**
- Modify: `frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js`
- Modify: `frappe/public/js/frappe/views/reports/report_view.js`

- [ ] **Step 1: Write a failing refresh-generation test**

Add and export a small generation guard from the helper:

```javascript
const guard = create_refresh_generation();
const first = guard.begin();
const second = guard.begin();
assert.equal(guard.is_current(first), false);
assert.equal(guard.is_current(second), true);
```

Add a source integration assertion that `ReportView.refresh()` checks the generation before `prepare_data()` and rendering.

- [ ] **Step 2: Run the test to verify RED**

Run the focused Node test. Expected: FAIL because `create_refresh_generation` is not exported and Report View has no response guard.

- [ ] **Step 3: Implement the refresh guard**

Add this helper and export it:

```javascript
function create_refresh_generation() {
	let generation = 0;
	return {
		begin() {
			generation += 1;
			return generation;
		},
		is_current(candidate) {
			return candidate === generation;
		},
	};
}
```

Initialize it in `ReportView.setup_defaults()` and override refresh with the BaseList sequence plus the current-generation check:

```javascript
refresh() {
	const args = this.get_call_args();
	if (this.no_change(args)) return Promise.resolve();

	const generation = this.refresh_generation.begin();
	this.freeze(true);
	return frappe.call(args).then((response) => {
		if (!this.refresh_generation.is_current(generation)) return;

		this.prepare_data(response);
		this.toggle_result_area();
		this.before_render();
		this.render();
		this.after_render();
		this.freeze(false);
		this.reset_defaults();
		this.settings.refresh?.(this);
	});
}
```

- [ ] **Step 4: Run focused and neighboring tests**

```bash
node --test frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
node --test frappe/public/js/frappe/form/controls/multi_currency.test.js
```

Expected: both suites PASS. The second command verifies the user's existing dirty multi-currency test remains unaffected.

- [ ] **Step 5: Commit request ordering behavior**

```bash
git add frappe/public/js/frappe/views/reports/report_view.js \
  frappe/public/js/frappe/views/reports/report_view_inline_filters.js \
  frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
git commit -m "fix: keep latest report filter response"
```

### Task 4: Verification and Activation

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] **Step 1: Run formatting and diff checks**

```bash
npx prettier --check frappe/public/js/frappe/views/reports/report_view.js \
  frappe/public/js/frappe/views/reports/report_view_inline_filters.js \
  frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
git diff --check HEAD~3..HEAD
```

Expected: PASS with no formatting or whitespace errors.

- [ ] **Step 2: Run focused frontend tests**

```bash
node --test frappe/public/js/frappe/views/reports/report_view_inline_filters.test.js
```

Expected: all tests PASS.

- [ ] **Step 3: Build production assets**

From the bench root:

```bash
bench build --app frappe
```

Expected: exit code 0 and a new `report.bundle.*.js` referenced by `sites/assets/assets.json`.

- [ ] **Step 4: Verify the built bundle contract**

Resolve the report bundle from `sites/assets/assets.json` and confirm it contains the server inline-filter module and 500 ms debounce behavior. Confirm the public asset URL returns HTTP 200.

- [ ] **Step 5: Activate and smoke-test the current bench**

Restart the bench web runtime only if the build does not make assets visible automatically, clear `sys.autohaina.com` cache, and verify HTTPS plus supervisor process health. In an authenticated browser, type a known value outside the initial 100 `gendan` rows into a lower column filter and confirm the network request contains the translated backend filter and returns the matching row.

- [ ] **Step 6: Record final evidence**

Update `/www/haina/frappe-bench/task_plan.md`, `findings.md`, and `progress.md` with test counts, build artifact, runtime commands, and whether authenticated browser verification was available.
