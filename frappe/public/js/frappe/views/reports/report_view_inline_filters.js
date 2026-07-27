(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
	root.frappe = root.frappe || {};
	root.frappe.views = root.frappe.views || {};
	root.frappe.views.report_inline_filters = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
	const exact_match_fieldtypes = new Set([
		"Check",
		"Currency",
		"Date",
		"Datetime",
		"Duration",
		"Float",
		"Int",
		"Percent",
		"Time",
	]);

	function parse_inline_filter_expression(input, docfield = {}) {
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

		const options = String(docfield.options || "").trim();
		if (
			docfield.fieldtype === "Currency" &&
			(options === "Multi Currency" || options.startsWith("Multi Currency:"))
		) {
			return ["like", `%${text}%`];
		}

		if (docfield.fieldtype === "Datetime" && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
			return ["between", [text, text]];
		}

		if (exact_match_fieldtypes.has(docfield.fieldtype)) {
			return ["=", text];
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
