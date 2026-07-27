const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
	append_report_inline_filters,
	build_report_inline_filters,
	create_refresh_generation,
	get_all_row_indices,
	parse_inline_filter_expression,
} = require("./report_view_inline_filters.js");

test("inline filter expressions preserve report comparison syntax", () => {
	assert.deepEqual(parse_inline_filter_expression(" ABC "), ["like", "%ABC%"]);
	assert.deepEqual(parse_inline_filter_expression(" > 10 "), [">", "10"]);
	assert.deepEqual(parse_inline_filter_expression("< 20"), ["<", "20"]);
	assert.deepEqual(parse_inline_filter_expression("= G-2607"), ["=", "G-2607"]);
	assert.deepEqual(parse_inline_filter_expression("!=0"), ["!=", "0"]);
});

test("inline filter expressions recognize numeric and ISO date ranges", () => {
	assert.deepEqual(parse_inline_filter_expression("5:10"), ["between", ["5", "10"]]);
	assert.deepEqual(parse_inline_filter_expression("2026-01-01:2026-01-31"), [
		"between",
		["2026-01-01", "2026-01-31"],
	]);
	assert.deepEqual(parse_inline_filter_expression("https://0.autohaina.com"), [
		"like",
		"%https://0.autohaina.com%",
	]);
});

test("inline filter expressions reject blank operands", () => {
	assert.equal(parse_inline_filter_expression(""), null);
	assert.equal(parse_inline_filter_expression("   "), null);
	assert.equal(parse_inline_filter_expression(">  "), null);
	assert.equal(parse_inline_filter_expression("!="), null);
});

test("report inline filters map parent and child columns to database filters", () => {
	const columns = [
		{ id: "_checkbox" },
		{ field: "name", docfield: { parent: "gendan" } },
		{ field: "vehicle_vin", docfield: { parent: "gendan_vehicle_item" } },
		{ field: "_aggregate_column", docfield: { parent: "gendan" } },
		{ field: "computed", docfield: { parent: "gendan", is_virtual: 1 } },
	];

	assert.deepEqual(
		build_report_inline_filters(
			{ 0: "ignored", 1: "G-2607", 2: "LVR", 3: ">2", 4: "secret" },
			columns
		),
		{
			filters: [
				["gendan", "name", "like", "%G-2607%"],
				["gendan_vehicle_item", "vehicle_vin", "like", "%LVR%"],
			],
			values: { 1: "G-2607", 2: "LVR" },
		}
	);
});

test("report inline filters omit blank and malformed column values", () => {
	const columns = [
		{ field: "name", docfield: { parent: "gendan" } },
		{ field: "delivery_date", docfield: { parent: "gendan" } },
	];

	assert.deepEqual(build_report_inline_filters({ 0: "", 1: ">" }, columns), {
		filters: [],
		values: {},
	});
	assert.deepEqual(build_report_inline_filters({}, columns), { filters: [], values: {} });
});

test("inline filters append without mutating standard filters", () => {
	const standard_filters = [["gendan", "company", "=", "海纳"]];
	const inline_filters = [["gendan", "name", "like", "%HN260%"]];

	assert.deepEqual(append_report_inline_filters(standard_filters, inline_filters), [
		["gendan", "company", "=", "海纳"],
		["gendan", "name", "like", "%HN260%"],
	]);
	assert.deepEqual(standard_filters, [["gendan", "company", "=", "海纳"]]);
});

test("server-backed DataTable filtering keeps every returned row visible", () => {
	assert.deepEqual(
		get_all_row_indices([{ meta: { rowIndex: 0 } }, { meta: { rowIndex: 4 } }]),
		[0, 4]
	);
});

test("refresh generation accepts only the latest report request", () => {
	const refresh_generation = create_refresh_generation();
	const first = refresh_generation.begin();
	const second = refresh_generation.begin();

	assert.equal(refresh_generation.is_current(first), false);
	assert.equal(refresh_generation.is_current(second), true);
});

test("Report View wires inline inputs to server-side filters", () => {
	const report_view_source = fs.readFileSync(path.join(__dirname, "report_view.js"), "utf8");

	assert.match(report_view_source, /import "\.\/report_view_inline_filters\.js";/);
	assert.match(report_view_source, /filterRows:\s*report_inline_filters\.get_all_row_indices/);
	assert.match(report_view_source, /bind_inline_filter_events\(\)/);
	assert.match(report_view_source, /frappe\.utils\.debounce\([\s\S]*?500\s*\)/);
	assert.match(
		report_view_source,
		/get_filters_for_args\(\)[\s\S]*?append_report_inline_filters/
	);
	assert.match(report_view_source, /this\.start = 0;[\s\S]*?this\.refresh\(\)/);
	assert.match(report_view_source, /has_inline_filters\(\)/);
	assert.match(report_view_source, /refresh_generation\.begin\(\)/);
	assert.match(
		report_view_source,
		/refresh_generation\.is_current\([^)]+\)[\s\S]*?prepare_data\(/
	);
});
