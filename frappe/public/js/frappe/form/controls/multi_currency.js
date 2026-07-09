(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
	root.frappe = root.frappe || {};
	root.frappe.ui = root.frappe.ui || {};
	root.frappe.ui.form = root.frappe.ui.form || {};
	root.frappe.ui.form.multi_currency = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
	const BASE_CURRENCY = "CNY";
	const SUPPORTED_CURRENCIES = ["CNY", "USD"];

	function is_multi_currency_df(df) {
		return parse_multi_currency_options(df).enabled;
	}

	function parse_multi_currency_options(df) {
		if (df?.fieldtype !== "Currency") {
			return { enabled: false, currency_field: "" };
		}

		const options = String(df?.options || "").trim();
		if (options === "Multi Currency") {
			return { enabled: true, currency_field: "currency" };
		}

		if (options.startsWith("Multi Currency:")) {
			return {
				enabled: true,
				currency_field: options.slice("Multi Currency:".length).trim() || "currency",
			};
		}

		return { enabled: false, currency_field: "" };
	}

	function normalize_currency(currency, fallback = BASE_CURRENCY) {
		const value = String(currency || "").trim() ? currency : fallback;
		return String(value || "")
			.trim()
			.toUpperCase();
	}

	function to_number(value) {
		if (typeof flt === "function") {
			return flt(value);
		}
		const number = Number(String(value || 0).replace(/,/g, ""));
		return Number.isFinite(number) ? number : 0;
	}

	function round_money(value) {
		return Math.round((to_number(value) + Number.EPSILON) * 100) / 100;
	}

	function get_currency_options() {
		return [...SUPPORTED_CURRENCIES];
	}

	function get_counter_currency(currency) {
		const normalized_currency = normalize_currency(currency);
		if (normalized_currency === "CNY") {
			return "USD";
		}
		if (normalized_currency === "USD") {
			return "CNY";
		}
		return "";
	}

	function convert_between_cny_usd(amount, from_currency, to_currency, usd_cny_rate) {
		const normalized_from_currency = normalize_currency(from_currency);
		const normalized_to_currency = normalize_currency(to_currency);
		const rate = to_number(usd_cny_rate);
		if (!amount || rate <= 0 || !SUPPORTED_CURRENCIES.includes(normalized_from_currency) || !SUPPORTED_CURRENCIES.includes(normalized_to_currency)) {
			return 0;
		}
		if (normalized_from_currency === normalized_to_currency) {
			return round_money(amount);
		}
		if (normalized_from_currency === "USD" && normalized_to_currency === "CNY") {
			return round_money(to_number(amount) * rate);
		}
		return round_money(to_number(amount) / rate);
	}

	function format_money_amount(amount, precision = 2) {
		return typeof format_number === "function"
			? format_number(amount, null, precision)
			: to_number(amount).toLocaleString("en-US", {
				minimumFractionDigits: precision,
				maximumFractionDigits: precision,
			});
	}

	function format_conversion_line({ amount, currency, usd_cny_rate, precision = 2 }) {
		const target_currency = get_counter_currency(currency);
		if (!target_currency) {
			return "";
		}
		const converted_amount = convert_between_cny_usd(
			amount,
			currency,
			target_currency,
			usd_cny_rate
		);
		if (converted_amount <= 0) {
			return "";
		}
		const rate = to_number(usd_cny_rate).toFixed(4);
		return `≈ ${target_currency} ${format_money_amount(
			converted_amount,
			precision
		)} · 汇率 1 USD = ${rate} CNY`;
	}

	function get_usd_cny_exchange_rate_args() {
		return {
			from_currency: "USD",
			to_currency: "CNY",
		};
	}

	function get_multi_currency_input_value({ currency, amount, usd_cny_rate }) {
		const normalized_currency = normalize_currency(currency);
		return {
			currency: normalized_currency,
			amount,
			exchange_rate: normalized_currency === "USD" ? to_number(usd_cny_rate) : 1,
		};
	}

	function calculate_base_amount(amount, currency, exchange_rate, base_currency = BASE_CURRENCY) {
		const normalized_currency = normalize_currency(currency);
		const normalized_base_currency = normalize_currency(base_currency);
		if (normalized_currency === normalized_base_currency) {
			return round_money(amount);
		}

		const rate = to_number(exchange_rate);
		if (to_number(amount) === 0) {
			return 0;
		}
		if (rate <= 0) {
			throw new Error("missing exchange rate");
		}
		return round_money(to_number(amount) * rate);
	}

	function parse_value(value) {
		if (typeof value === "object" && value !== null) {
			return value;
		}
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.startsWith("{")) {
				try {
					return JSON.parse(trimmed);
				} catch {
					return {};
				}
			}
		}
		return { amount: value };
	}

	function normalize_multi_currency_value(value, base_currency = BASE_CURRENCY) {
		const parsed = parse_value(value);
		const currency = normalize_currency(parsed.currency, base_currency);
		const amount = round_money(parsed.amount);
		const exchange_rate =
			currency === normalize_currency(base_currency) ? 1 : to_number(parsed.exchange_rate);
		const normalized = {
			currency,
			amount,
			exchange_rate,
			base_currency: normalize_currency(parsed.base_currency, base_currency),
			base_amount: 0,
		};
		normalized.base_amount = calculate_base_amount(
			normalized.amount,
			normalized.currency,
			normalized.exchange_rate,
			normalized.base_currency
		);
		return normalized;
	}

	function serialize_multi_currency_value(value, base_currency = BASE_CURRENCY) {
		const normalized = normalize_multi_currency_value(value, base_currency);
		return JSON.stringify(normalized);
	}

	function serialize_multi_currency_filter_value(value) {
		const parsed = parse_value(value);
		return JSON.stringify({
			currency: normalize_currency(parsed.currency),
			amount: round_money(parsed.amount),
		});
	}

	function format_multi_currency_value(value, precision = 2) {
		const parsed = parse_value(value);
		const currency = normalize_currency(parsed.currency);
		const amount_value = round_money(parsed.amount);
		const amount = typeof format_number === "function"
			? format_number(amount_value, null, precision)
			: amount_value.toLocaleString("en-US", {
				minimumFractionDigits: precision,
				maximumFractionDigits: precision,
			});
		return `${currency} ${amount}`;
	}

	function get_list_title_value(value, precision = 2) {
		const parsed = parse_value(value);
		const normalized = normalize_multi_currency_value(value);
		const lines = [format_multi_currency_value(value, precision)];
		const rate = to_number(parsed.exchange_rate || normalized.exchange_rate);
		if (normalized.amount > 0 && rate > 0) {
			if (normalized.currency === "USD") {
				const converted_amount = normalized.base_amount || convert_between_cny_usd(
					normalized.amount,
					"USD",
					"CNY",
					rate
				);
				if (converted_amount > 0) {
					lines.push(`换算金额: CNY ${format_money_amount(converted_amount, precision)}`);
					lines.push(`汇率: 1 USD = ${rate.toFixed(4)} CNY`);
				}
			} else if (normalized.currency === "CNY" && rate > 1) {
				const converted_amount = convert_between_cny_usd(
					normalized.amount,
					"CNY",
					"USD",
					rate
				);
				if (converted_amount > 0) {
					lines.push(`换算金额: USD ${format_money_amount(converted_amount, precision)}`);
					lines.push(`汇率: 1 USD = ${rate.toFixed(4)} CNY`);
				}
			}
		}
		return lines.join("\n");
	}

	return {
		calculate_base_amount,
		convert_between_cny_usd,
		format_multi_currency_value,
		format_conversion_line,
		get_list_title_value,
		get_counter_currency,
		get_currency_options,
		get_multi_currency_input_value,
		get_usd_cny_exchange_rate_args,
		is_multi_currency_df,
		normalize_multi_currency_value,
		parse_multi_currency_options,
		serialize_multi_currency_filter_value,
		serialize_multi_currency_value,
	};
});
