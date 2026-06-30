import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function formatMessage(message, args) {
	if (!Array.isArray(args)) {
		return message;
	}

	return message.replace(/\{(\d+)\}/g, (_, index) => {
		const value = args[Number(index)];
		return value == null ? "" : String(value);
	});
}

async function loadModule() {
	const modulePath = pathToFileURL(
		"/www/haina/frappe-bench/apps/frappe/frappe/public/js/frappe/form/footer/version_timeline_content_builder.js"
	);
	const source = await readFile(modulePath, "utf8");

	return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

test("get_version_timeline_content supports row_changed entries from Table MultiSelect", async () => {
	globalThis.__ = (message, args) => formatMessage(message, args);

	const dollar = () => [];
	dollar.isEmptyObject = (value) => !value || Object.keys(value).length === 0;
	globalThis.$ = dollar;

	globalThis.frappe = {
		meta: {
			get_docfield(doctype, fieldname) {
				if (doctype === "payment_car_vin" && fieldname === "vehicles") {
					return {
						label: "车型",
						parent: "payment_car_vin",
					};
				}

				return null;
			},
			get_label(doctype, fieldname) {
				if (doctype === "payment_car_vin" && fieldname === "vehicles") {
					return "车型";
				}

				return fieldname;
			},
		},
		perm: {
			get_field_display_status() {
				return "Read";
			},
		},
		utils: {
			get_form_link(_doctype, _docname, _as_html, label) {
				return label || "";
			},
			html2text(value) {
				return value == null ? "" : String(value);
			},
			escape_html(value) {
				return String(value);
			},
			is_current_user() {
				return false;
			},
		},
		ellipsis(value) {
			return value;
		},
		user_info() {
			return {
				fullname: "Test User",
			};
		},
	};

	const { get_version_timeline_content } = await loadModule();

	const result = get_version_timeline_content(
		{
			name: "VER-0001",
			owner: "test@example.com",
			data: JSON.stringify({
				row_changed: [
					[
						"payment_car_vin",
						0,
						"row-1",
						[
							["vehicles", "", "奥迪A3"],
						],
					],
				],
			}),
		},
		{
			doctype: "payment_application",
			docname: "PA-TEST-001",
			perm: [],
			fields_dict: {
				payment_car_vin: {
					df: {
						fieldtype: "Table MultiSelect",
						options: "payment_car_vin",
					},
				},
			},
		}
	);

	assert.equal(result.length, 1);
	assert.match(result[0], /车型/);
});
