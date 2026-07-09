const test = require("node:test");
const assert = require("node:assert/strict");

const {
	calculate_base_amount,
	convert_between_cny_usd,
	format_multi_currency_value,
	get_list_title_value,
	format_conversion_line,
	get_counter_currency,
	get_currency_options,
	get_multi_currency_input_value,
	get_usd_cny_exchange_rate_args,
	is_multi_currency_df,
	normalize_multi_currency_value,
	parse_multi_currency_options,
	serialize_multi_currency_filter_value,
	serialize_multi_currency_value,
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

test("get_currency_options only exposes CNY and USD", () => {
	assert.deepEqual(get_currency_options(), ["CNY", "USD"]);
});

test("get_counter_currency only converts between CNY and USD", () => {
	assert.equal(get_counter_currency("CNY"), "USD");
	assert.equal(get_counter_currency("USD"), "CNY");
	assert.equal(get_counter_currency("USDT"), "");
});

test("convert_between_cny_usd converts both directions with one USD-CNY rate", () => {
	assert.equal(convert_between_cny_usd(720, "CNY", "USD", 7.2), 100);
	assert.equal(convert_between_cny_usd(100, "USD", "CNY", 7.2), 720);
});

test("format_conversion_line shows converted amount and exchange rate", () => {
	assert.equal(
		format_conversion_line({ amount: 100, currency: "USD", usd_cny_rate: 7.2 }),
		"≈ CNY 720.00 · 汇率 1 USD = 7.2000 CNY"
	);
	assert.equal(
		format_conversion_line({ amount: 720, currency: "CNY", usd_cny_rate: 7.2 }),
		"≈ USD 100.00 · 汇率 1 USD = 7.2000 CNY"
	);
});

test("get_usd_cny_exchange_rate_args does not include document business date", () => {
	assert.deepEqual(get_usd_cny_exchange_rate_args({ sfk_date: "2026-04-18 10:30:30" }), {
		from_currency: "USD",
		to_currency: "CNY",
	});
});

test("get_multi_currency_input_value includes USD-CNY rate for USD amount", () => {
	assert.deepEqual(
		get_multi_currency_input_value({
			currency: "USD",
			amount: "8,950.00",
			usd_cny_rate: 6.7935,
		}),
		{
			currency: "USD",
			amount: "8,950.00",
			exchange_rate: 6.7935,
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
