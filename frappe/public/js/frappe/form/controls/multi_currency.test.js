const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
	calculate_base_amount,
	convert_between_cny_usd,
	format_multi_currency_value,
	format_saved_value_conversion_line,
	format_conversion_rate_title,
	get_list_title_value,
	format_conversion_line,
	get_counter_currency,
	get_currency_options,
	get_exchange_rate_args,
	get_multi_currency_input_value,
	get_document_usd_cny_rate,
	get_usd_cny_exchange_rate_args,
	is_multi_currency_df,
	normalize_multi_currency_value,
	open_grid_multi_currency_menu,
	parse_multi_currency_options,
	set_document_currency,
	should_cache_saved_exchange_rate,
	serialize_multi_currency_filter_value,
	serialize_multi_currency_value,
	should_rebuild_multi_currency_input,
} = require("./multi_currency.js");

test("is_multi_currency_df detects Currency fields with Multi Currency option", () => {
	assert.equal(is_multi_currency_df({ fieldtype: "Currency", options: "Multi Currency" }), true);
	assert.equal(is_multi_currency_df({ fieldtype: "Currency", options: "Multi Currency:currency" }), true);
	assert.equal(is_multi_currency_df({ fieldtype: "Currency", options: "currency" }), false);
	assert.equal(is_multi_currency_df({ fieldtype: "Float", options: "Multi Currency" }), false);
});

test("parse_multi_currency_options keeps the source currency field", () => {
	assert.deepEqual(parse_multi_currency_options({ fieldtype: "Currency", options: "Multi Currency:currency" }), {
		enabled: true,
		currency_field: "currency",
	});
});

test("normalize_multi_currency_value parses saved JSON value", () => {
	assert.deepEqual(
		normalize_multi_currency_value('{"currency":"usd","amount":12000,"exchange_rate":7.2}'),
		{
			currency: "USD",
			amount: 12000,
			exchange_rate: 7.2,
			base_currency: "CNY",
			base_amount: 86400,
		}
	);
});

test("normalize_multi_currency_value treats plain numeric value as CNY", () => {
	assert.deepEqual(normalize_multi_currency_value("30000"), {
		currency: "CNY",
		amount: 30000,
		exchange_rate: 1,
		base_currency: "CNY",
		base_amount: 30000,
	});
});

test("normalize_multi_currency_value parses formatted amount strings", () => {
	assert.deepEqual(
		normalize_multi_currency_value({
			currency: "USD",
			amount: "12,000.00",
			exchange_rate: "7.20",
		}),
		{
			currency: "USD",
			amount: 12000,
			exchange_rate: 7.2,
			base_currency: "CNY",
			base_amount: 86400,
		}
	);
});

test("serialize_multi_currency_value stores one field value as JSON", () => {
	assert.equal(
		serialize_multi_currency_value({ currency: "USD", amount: 12000, exchange_rate: 7.2 }),
		'{"currency":"USD","amount":12000,"exchange_rate":7.2,"base_currency":"CNY","base_amount":86400}'
	);
});

test("serialize_multi_currency_value allows zero foreign amount without rate", () => {
	assert.equal(
		serialize_multi_currency_value({ currency: "USD", amount: 0, exchange_rate: 0 }),
		'{"currency":"USD","amount":0,"exchange_rate":0,"base_currency":"CNY","base_amount":0}'
	);
});

test("serialize_multi_currency_value does not throw while foreign exchange rate is loading", () => {
	assert.equal(
		serialize_multi_currency_value({ currency: "RUB", amount: 41500, exchange_rate: 0 }),
		'{"currency":"RUB","amount":41500,"exchange_rate":0,"base_currency":"CNY","base_amount":0}'
	);
});

test("serialize_multi_currency_filter_value stores only currency and amount", () => {
	assert.equal(
		serialize_multi_currency_filter_value({ currency: "USD", amount: "6,666.00" }),
		'{"currency":"USD","amount":6666}'
	);
});

test("format_multi_currency_value formats saved JSON with embedded currency", () => {
	assert.equal(
		format_multi_currency_value('{"currency":"USD","amount":12000,"exchange_rate":7.2}', 2),
		"USD 12,000.00"
	);
});

test("format_multi_currency_value does not require exchange rate for filter values", () => {
	assert.equal(format_multi_currency_value('{"currency":"USD","amount":12000}', 2), "USD 12,000.00");
});

test("get_list_title_value includes converted amount and exchange rate for row hover text", () => {
	assert.equal(
		get_list_title_value(
			'{"currency":"USD","amount":6666,"exchange_rate":6.79,"base_currency":"CNY","base_amount":45262.14}',
			2
		),
		"USD 6,666.00\n换算金额: CNY 45,262.14\n汇率: 1 USD = 6.7900 CNY"
	);
});

test("calculate_base_amount rejects foreign currency without rate", () => {
	assert.throws(() => calculate_base_amount(12000, "USD", 0), /missing exchange rate/);
});

test("get_currency_options falls back to CNY and USD without boot currencies", () => {
	assert.deepEqual(get_currency_options(), ["CNY", "USD"]);
});

test("get_currency_options exposes enabled Currency docs from boot", () => {
	const previous_frappe = globalThis.frappe;
	globalThis.frappe = {
		boot: {
			docs: [
				{ doctype: ":Currency", name: "CNY" },
				{ doctype: ":Currency", name: "USD" },
				{ doctype: ":Currency", name: "RUB" },
				{ doctype: ":Currency", name: "EUR" },
				{ doctype: "Currency", name: "JPY" },
			],
		},
	};

	try {
		assert.deepEqual(get_currency_options(), ["CNY", "USD", "RUB", "EUR"]);
	} finally {
		globalThis.frappe = previous_frappe;
	}
});

test("get_counter_currency converts any foreign currency to CNY", () => {
	assert.equal(get_counter_currency("CNY"), "USD");
	assert.equal(get_counter_currency("USD"), "CNY");
	assert.equal(get_counter_currency("RUB"), "CNY");
});

test("convert_between_cny_usd converts both directions with one USD-CNY rate", () => {
	assert.equal(convert_between_cny_usd(720, "CNY", "USD", 7.2), 100);
	assert.equal(convert_between_cny_usd(100, "USD", "CNY", 7.2), 720);
});

test("format_conversion_line shows foreign amount converted to CNY", () => {
	assert.equal(
		format_conversion_line({ amount: 100, currency: "USD", exchange_rate: 7.2 }),
		"≈ CNY 720.00"
	);
	assert.equal(
		format_conversion_line({ amount: 1000, currency: "RUB", exchange_rate: 0.089 }),
		"≈ CNY 89.00"
	);
	assert.equal(
		format_conversion_line({ amount: 720, currency: "CNY", exchange_rate: 7.2 }),
		"≈ USD 100.00"
	);
});

test("format_conversion_rate_title returns selected currency to CNY exchange rate", () => {
	assert.equal(
		format_conversion_rate_title({ amount: 100, currency: "USD", exchange_rate: 7.2 }),
		"汇率 1 USD = 7.2000 CNY"
	);
	assert.equal(
		format_conversion_rate_title({ amount: 1000, currency: "RUB", exchange_rate: 0.089 }),
		"汇率 1 RUB = 0.0890 CNY"
	);
	assert.equal(
		format_conversion_rate_title({ amount: 720, currency: "CNY", exchange_rate: 7.2 }),
		"汇率 1 USD = 7.2000 CNY"
	);
});

test("format_saved_value_conversion_line formats readonly saved multi-currency value", () => {
	assert.equal(
			format_saved_value_conversion_line(
				'{"currency":"CNY","amount":666,"exchange_rate":1,"base_currency":"CNY","base_amount":666}',
				6.796,
				2
			),
			"≈ USD 98.00"
	);
	assert.equal(
		format_saved_value_conversion_line(
			'{"currency":"RUB","amount":1000,"exchange_rate":0.089,"base_currency":"CNY","base_amount":89}',
			0,
			2
		),
		"≈ CNY 89.00"
	);
});

test("get_exchange_rate_args requests selected currency to CNY rate", () => {
	assert.deepEqual(get_exchange_rate_args("RUB"), {
		from_currency: "RUB",
		to_currency: "CNY",
	});
	assert.deepEqual(get_usd_cny_exchange_rate_args({ sfk_date: "2026-04-18 10:30:30" }), {
		from_currency: "USD",
		to_currency: "CNY",
	});
});

test("get_document_usd_cny_rate prefers parent form exchange rate for child rows", () => {
	assert.equal(
		get_document_usd_cny_rate(
			{ doctype: "xiaoshou_items", exchange_rate: 6.796 },
			{ doctype: "xiaoshou", exchange_rate: 6.83 }
		),
		6.83
	);
	assert.equal(get_document_usd_cny_rate({ doctype: "xiaoshou", exchange_rate: 6.83 }), 6.83);
	assert.equal(get_document_usd_cny_rate({ doctype: "xiaoshou_items", exchange_rate: 6.796 }), 6.796);
});

test("get_multi_currency_input_value includes exchange rate for foreign amount", () => {
	assert.deepEqual(
		get_multi_currency_input_value({
			currency: "RUB",
			amount: "8,950.00",
			exchange_rate: 0.089,
		}),
		{
			currency: "RUB",
			amount: "8,950.00",
			exchange_rate: 0.089,
		}
	);
});

test("get_multi_currency_input_value defaults blank currency to CNY", () => {
	assert.deepEqual(get_multi_currency_input_value({ currency: "", amount: "8950" }), {
		currency: "CNY",
		amount: "8950",
		exchange_rate: 1,
	});
});

test("should_cache_saved_exchange_rate ignores CNY self rate", () => {
	assert.equal(should_cache_saved_exchange_rate("CNY", 1), false);
	assert.equal(should_cache_saved_exchange_rate("USD", 6.76), true);
	assert.equal(should_cache_saved_exchange_rate("RUB", 0.089), true);
});

test("set_document_currency updates parent form currency field", () => {
	const calls = [];
	const frm = {
		set_value(fieldname, value) {
			calls.push([fieldname, value]);
		},
	};

	set_document_currency({
		frm,
		doc: { doctype: "payment_application", name: "PA-001" },
		doctype: "payment_application",
		docname: "PA-001",
		currency_field: "currency",
		currency: "USD",
	});

	assert.deepEqual(calls, [["currency", "USD"]]);
});

test("set_document_currency updates child row currency field through model", () => {
	const previous_frappe = globalThis.frappe;
	const calls = [];
	let triggerCount = 0;
	const row = {
		doctype: "payment_application_reference",
		name: "row-1",
		parentfield: "references",
		allocated_currency: "CNY",
	};
	globalThis.frappe = {
		model: {
			set_value(doctype, docname, fieldname, value) {
				calls.push([doctype, docname, fieldname, value]);
				if (row[fieldname] !== value) {
					row[fieldname] = value;
					triggerCount += 1;
				}
			},
		},
		ui: { form: { multi_currency: {} } },
	};

	try {
		set_document_currency({
			frm: {
				set_value() {
					throw new Error("parent setter should not be used for child rows");
				},
			},
			doc: row,
			doctype: "payment_application_reference",
			docname: "row-1",
			currency_field: "allocated_currency",
			currency: "USD",
		});
	} finally {
		globalThis.frappe = previous_frappe;
	}

	assert.deepEqual(calls, [["payment_application_reference", "row-1", "allocated_currency", "USD"]]);
	assert.equal(row.allocated_currency, "USD");
	assert.equal(triggerCount, 1);
});

test("should_rebuild_multi_currency_input detects grid input replaced outside existing wrapper", () => {
	assert.equal(
		should_rebuild_multi_currency_input({
			has_wrapper: true,
			input_inside_wrapper: true,
			picker_inside_wrapper: true,
			menu_inside_wrapper: true,
		}),
		false
	);
	assert.equal(
		should_rebuild_multi_currency_input({
			has_wrapper: true,
			input_inside_wrapper: false,
			picker_inside_wrapper: true,
			menu_inside_wrapper: true,
		}),
		true
	);
	assert.equal(
		should_rebuild_multi_currency_input({
			has_wrapper: true,
			input_inside_wrapper: true,
			picker_inside_wrapper: false,
			menu_inside_wrapper: true,
		}),
		true
	);
});

test("multi-currency amount control refreshes its conversion line on blur", () => {
	const control_source = fs.readFileSync(path.join(__dirname, "currency.js"), "utf8");
	const setup_method = control_source.match(
		/\n\tsetup_multi_currency_input\(\) \{([\s\S]*?)\n\treset_multi_currency_input_shell\(\) \{/
	)?.[1];

	assert.ok(setup_method, "setup_multi_currency_input method should exist");
	assert.match(setup_method, /\$input\.on\("blur\.multi-currency-control",/);
	assert.doesNotMatch(setup_method, /\$input\.on\("input\.multi-currency-control",/);
	assert.doesNotMatch(setup_method, /this\.frm\?\.dirty\?\.\(\);/);
});

test("multi-currency picker keeps normal stacking order until its menu is opened", () => {
	const control_source = fs.readFileSync(path.join(__dirname, "currency.js"), "utf8");
	const setup_method = control_source.match(
		/\n\tsetup_multi_currency_input\(\) \{([\s\S]*?)\n\treset_multi_currency_input_shell\(\) \{/
	)?.[1];

	assert.ok(setup_method, "setup_multi_currency_input method should exist");
	assert.doesNotMatch(setup_method, /multi-currency-picker[^`]*z-index:\s*[1-9]/);
	assert.match(setup_method, /\$input\.after\(this\.\$currency_picker\);/);
});

test("multi-currency amount control commits only on native change", () => {
	const control_source = fs.readFileSync(path.join(__dirname, "currency.js"), "utf8");
	const bind_change_event = control_source.match(
		/\n\tbind_change_event\(\) \{([\s\S]*?)\n\tmake_input\(\) \{/
	)?.[1];

	assert.ok(bind_change_event, "ControlCurrency should specialize bind_change_event");
	assert.match(bind_change_event, /if \(!this\.is_multi_currency\(\)\) \{\s*return super\.bind_change_event\(\);\s*\}/);
	assert.match(bind_change_event, /if \(this\.change\) this\.change\(e\);\s*else \{\s*this\.parse_validate_and_set_in_model\(this\.get_input_value\(\), e\);\s*\}/);
	assert.match(bind_change_event, /this\.\$input\.on\("change", change_handler\);/);
	assert.doesNotMatch(bind_change_event, /this\.\$input\.on\("input"/);
});

test("open_grid_multi_currency_menu opens the picker on first grid row activation", () => {
	let openCount = 0;
	const field = {
		is_multi_currency() {
			return true;
		},
		open_multi_currency_menu() {
			openCount += 1;
			return true;
		},
	};

	assert.equal(open_grid_multi_currency_menu(field, true), true);
	assert.equal(openCount, 1);
	assert.equal(open_grid_multi_currency_menu(field, false), false);
	assert.equal(openCount, 1);
});
