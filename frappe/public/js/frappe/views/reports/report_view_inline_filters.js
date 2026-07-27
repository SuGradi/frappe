(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
	root.frappe = root.frappe || {};
	root.frappe.views = root.frappe.views || {};
	root.frappe.views.report_inline_filters = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
	const numeric_fieldtypes = new Set([
		"Check",
		"Currency",
		"Duration",
		"Float",
		"Int",
		"Percent",
	]);

	function is_numeric_value(value) {
		return /^-?\d+(?:\.\d+)?$/.test(value);
	}

	function is_iso_date(value) {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
		if (!match) return false;

		const [, year, month, day] = match.map(Number);
		const date = new Date(Date.UTC(year, month - 1, day));
		return (
			date.getUTCFullYear() === year &&
			date.getUTCMonth() === month - 1 &&
			date.getUTCDate() === day
		);
	}

	function is_time(value) {
		const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/.exec(value);
		if (!match) return false;

		const [, hour, minute, second = "0"] = match;
		return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59;
	}

	function is_datetime(value) {
		const [date, time, extra] = value.split(/[ T]/);
		return !extra && Boolean(time) && is_iso_date(date) && is_time(time);
	}

	function is_multi_currency(docfield) {
		const options = String(docfield.options || "").trim();
		return (
			docfield.fieldtype === "Currency" &&
			(options === "Multi Currency" || options.startsWith("Multi Currency:"))
		);
	}

	function is_valid_operand(value, docfield) {
		if (is_multi_currency(docfield)) return false;
		if (numeric_fieldtypes.has(docfield.fieldtype)) return is_numeric_value(value);
		if (docfield.fieldtype === "Date") return is_iso_date(value);
		if (docfield.fieldtype === "Datetime") return is_iso_date(value) || is_datetime(value);
		if (docfield.fieldtype === "Time") return is_time(value);
		return true;
	}

	function parse_inline_filter_expression(input, docfield = {}) {
		const text = String(input ?? "").trim();
		if (!text) return null;

		if (docfield.fieldtype === "Time" && is_time(text)) {
			return ["=", text];
		}

		const range = text.split(":").map((value) => value.trim());
		const is_valid_range =
			!is_multi_currency(docfield) &&
			range.length === 2 &&
			(numeric_fieldtypes.has(docfield.fieldtype)
				? range.every(is_numeric_value)
				: ["Date", "Datetime"].includes(docfield.fieldtype)
				? range.every(is_iso_date)
				: docfield.fieldtype !== "Time" &&
				  range.every((value) => is_numeric_value(value) || is_iso_date(value)));
		if (is_valid_range) {
			return ["between", range];
		}

		for (const operator of ["!=", ">", "<", "="]) {
			if (text.startsWith(operator)) {
				const value = text.slice(operator.length).trim();
				return value && is_valid_operand(value, docfield) ? [operator, value] : null;
			}
		}

		if (is_multi_currency(docfield)) {
			return ["like", `%${text}%`];
		}

		if (docfield.fieldtype === "Date") {
			return is_iso_date(text) ? ["=", text] : null;
		}

		if (docfield.fieldtype === "Datetime" && is_iso_date(text)) {
			return ["between", [text, text]];
		}

		if (docfield.fieldtype === "Datetime") {
			return is_datetime(text) ? ["=", text] : null;
		}

		if (docfield.fieldtype === "Time") {
			return null;
		}

		return ["like", `%${text}%`];
	}

	function get_report_inline_filter_key(column) {
		const fieldname = column?.field;
		const doctype = column?.docfield?.parent;
		if (
			!fieldname ||
			!doctype ||
			fieldname === "_aggregate_column" ||
			column.docfield.is_virtual
		) {
			return null;
		}
		return `${doctype}::${fieldname}`;
	}

	function build_report_inline_filters_from_state(values, columns) {
		const filters = [];
		const accepted_values = {};

		for (const column of columns || []) {
			const key = get_report_inline_filter_key(column);
			if (!key || !Object.hasOwn(values || {}, key)) continue;

			const expression = parse_inline_filter_expression(values[key], column.docfield);
			if (!expression) continue;

			accepted_values[key] = values[key];
			filters.push([column.docfield.parent, column.field, expression[0], expression[1]]);
		}

		return { filters, values: accepted_values };
	}

	function build_report_inline_filters(values, columns) {
		const state = {};

		for (const [column_index, input] of Object.entries(values || {})) {
			const column = columns?.[Number(column_index)];
			const key = get_report_inline_filter_key(column);
			if (key) state[key] = input;
		}

		return build_report_inline_filters_from_state(state, columns);
	}

	function append_report_inline_filters(standard_filters, inline_filters) {
		return [...standard_filters, ...inline_filters];
	}

	function get_all_row_indices(rows) {
		return rows.map((row) => row.meta.rowIndex);
	}

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
			current() {
				return generation;
			},
		};
	}

	return {
		append_report_inline_filters,
		build_report_inline_filters,
		build_report_inline_filters_from_state,
		create_refresh_generation,
		get_all_row_indices,
		get_report_inline_filter_key,
		parse_inline_filter_expression,
	};
});
