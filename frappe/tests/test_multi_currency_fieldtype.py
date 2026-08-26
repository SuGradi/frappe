import unittest
from unittest.mock import patch

import frappe
from frappe.database.schema import DbColumn, get_definition
from frappe.model.base_document import BaseDocument
from frappe.model.db_query import DatabaseQuery
from frappe.utils.formatters import format_value


class TestMultiCurrencyFieldtype(unittest.TestCase):
	def setUp(self):
		self.original_db = getattr(frappe.local, "db", None)
		self.original_session = getattr(frappe.local, "session", None)
		self.original_conf = getattr(frappe.local, "conf", None)
		frappe.local.db = frappe._dict(
			{
				"VARCHAR_LEN": 140,
				"get_default": lambda key: None,
				"get_value": lambda *args, **kwargs: None,
				"type_map": {
					"Currency": ("decimal", "21,9"),
					"Data": ("varchar", 140),
					"Text": ("text", ""),
				},
			}
		)

	def tearDown(self):
		frappe.local.db = self.original_db
		frappe.local.session = self.original_session
		frappe.local.conf = self.original_conf

	def test_multi_currency_column_uses_single_varchar_storage(self):
		self.assertEqual(get_definition("Currency", options="Multi Currency"), "text")
		self.assertEqual(get_definition("Currency", options="Multi Currency:currency"), "text")

	def test_regular_currency_column_stays_decimal(self):
		self.assertEqual(get_definition("Currency"), "decimal(21,9)")

	def test_multi_currency_column_has_no_numeric_default(self):
		column = DbColumn(
			table=None,
			fieldname="amount",
			fieldtype="Currency",
			length=None,
			default=None,
			set_index=None,
			options="Multi Currency",
			unique=None,
			precision=None,
		)

		self.assertEqual(column.get_definition(), "text")

	def test_multi_currency_value_requires_exchange_rate_for_foreign_currency(self):
		from frappe.utils.multi_currency import parse_multi_currency_value

		with self.assertRaises(ValueError):
			parse_multi_currency_value('{"currency":"USD","amount":12000}')

	def test_multi_currency_value_allows_zero_foreign_amount_without_exchange_rate(self):
		from frappe.utils.multi_currency import parse_multi_currency_value

		money = parse_multi_currency_value('{"currency":"USD","amount":0}')

		self.assertEqual(money.currency, "USD")
		self.assertEqual(money.amount, 0)
		self.assertEqual(money.exchange_rate, 0)
		self.assertEqual(money.base_amount, 0)

	def test_multi_currency_value_is_not_cast_to_float(self):
		meta = frappe._dict(
			{
				"fields": [
					frappe._dict(
						{
							"fieldname": "amount",
							"fieldtype": "Currency",
							"options": "Multi Currency",
						}
					)
				]
			}
		)
		meta.get_table_fields = lambda: ()

		original_meta = BaseDocument.meta
		BaseDocument.meta = property(lambda self: meta)
		try:
			doc = BaseDocument(
				{
					"doctype": "Test Multi Currency Doc",
					"amount": '{"currency":"USD","amount":12000}',
				}
			)
			doc._fix_numeric_types()
		finally:
			BaseDocument.meta = original_meta

		self.assertEqual(doc.amount, '{"currency":"USD","amount":12000}')

	def test_multi_currency_valid_dict_keeps_json_value(self):
		meta = frappe._dict(
			{
				"fields": [
					frappe._dict(
						{
							"fieldname": "amount",
							"fieldtype": "Currency",
							"options": "Multi Currency",
						}
					)
				]
			}
		)
		meta.get_table_fields = lambda: ()
		meta.get_valid_columns = lambda: ("doctype", "amount")
		meta.get_field = lambda fieldname: meta.fields[0] if fieldname == "amount" else None

		original_meta = BaseDocument.meta
		BaseDocument.meta = property(lambda self: meta)
		try:
			doc = BaseDocument(
				{
					"doctype": "Test Multi Currency Doc",
					"amount": '{"currency":"CNY","amount":123,"exchange_rate":1}',
				}
			)
			valid_dict = doc.get_valid_dict()
		finally:
			BaseDocument.meta = original_meta

		self.assertEqual(valid_dict.amount, '{"currency":"CNY","amount":123,"exchange_rate":1}')

	def test_multi_currency_get_value_keeps_json_value(self):
		field = frappe._dict(
			{
				"fieldname": "amount",
				"fieldtype": "Currency",
				"options": "Multi Currency:currency",
			}
		)
		meta = frappe._dict({"fields": [field]})
		meta.get_table_fields = lambda: ()
		meta.get_field = lambda fieldname: field if fieldname == "amount" else None

		original_meta = BaseDocument.meta
		BaseDocument.meta = property(lambda self: meta)
		try:
			doc = BaseDocument(
				{
					"doctype": "Test Multi Currency Doc",
					"amount": '{"currency":"CNY","amount":123,"exchange_rate":1}',
				}
			)
			value = doc.get_value("amount")
		finally:
			BaseDocument.meta = original_meta

		self.assertEqual(value, '{"currency":"CNY","amount":123,"exchange_rate":1}')

	def test_multi_currency_numeric_cast_accepts_trimmed_option(self):
		meta = frappe._dict(
			{
				"fields": [
					frappe._dict(
						{
							"fieldname": "amount",
							"fieldtype": "Currency",
							"options": " Multi Currency ",
						}
					)
				]
			}
		)
		meta.get_table_fields = lambda: ()

		original_meta = BaseDocument.meta
		BaseDocument.meta = property(lambda self: meta)
		try:
			doc = BaseDocument(
				{
					"doctype": "Test Multi Currency Doc",
					"amount": '{"currency":"USD","amount":12000}',
				}
			)
			doc._fix_numeric_types()
		finally:
			BaseDocument.meta = original_meta

		self.assertEqual(doc.amount, '{"currency":"USD","amount":12000}')

	def test_multi_currency_formatter_uses_embedded_currency(self):
		value = '{"currency":"USD","amount":12000,"exchange_rate":7.2,"base_currency":"CNY","base_amount":86400}'
		df = frappe._dict({"fieldtype": "Currency", "options": "Multi Currency"})

		with (
			patch("frappe.defaults.get_global_default", return_value=None),
			patch("frappe._", side_effect=lambda value, *args, **kwargs: value),
		):
			self.assertEqual(format_value(value, df), "USD 12,000.00")

	def test_multi_currency_formatter_accepts_currency_field_option(self):
		value = '{"currency":"USD","amount":12000,"exchange_rate":7.2,"base_currency":"CNY","base_amount":86400}'
		df = frappe._dict({"fieldtype": "Currency", "options": "Multi Currency:currency"})

		with (
			patch("frappe.defaults.get_global_default", return_value=None),
			patch("frappe._", side_effect=lambda value, *args, **kwargs: value),
		):
			self.assertEqual(format_value(value, df), "USD 12,000.00")

	def test_multi_currency_exact_filter_condition_matches_currency_and_amount(self):
		meta = frappe._dict(
			{
				"fields": [
					frappe._dict(
						{
							"fieldname": "amount",
							"fieldtype": "Currency",
							"options": "Multi Currency:currency",
						}
					)
				]
			}
		)
		meta.get_field = lambda fieldname: meta.fields[0] if fieldname == "amount" else None
		meta.has_field = lambda fieldname: fieldname == "amount"
		meta.get_table_fields = lambda: ()
		frappe.local.db.escape = lambda value, percent=True: "'{}'".format(value.replace("'", "''"))
		frappe.local.session = frappe._dict({"user": "Administrator"})
		frappe.local.conf = frappe._dict()

		with (
			patch("frappe.get_meta", return_value=meta),
			patch("frappe.boot.get_additional_filters_from_hooks", return_value={}),
		):
			query = DatabaseQuery("Test Multi Currency Doc")
			query.flags.ignore_permissions = True
			condition = query.prepare_filter_condition(
				[
					"Test Multi Currency Doc",
					"amount",
					"=",
					'{"currency":"USD","amount":6666.0}',
				]
			)

		self.assertIn(
			"json_unquote(json_extract(`tabTest Multi Currency Doc`.`amount`, '$.currency')) = 'USD'",
			condition,
		)
		self.assertIn(
			"cast(json_unquote(json_extract(`tabTest Multi Currency Doc`.`amount`, '$.amount')) as decimal(21,9)) = 6666.0",
			condition,
		)
		self.assertNotIn("exchange_rate", condition)


if __name__ == "__main__":
	unittest.main()
