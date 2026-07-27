(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
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
