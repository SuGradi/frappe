import json

import frappe
from frappe.utils import flt


BASE_CURRENCY = "CNY"
MULTI_CURRENCY_OPTION = "Multi Currency"


def is_multi_currency_df(df):
	return (
		df
		and df.get("fieldtype") == "Currency"
		and parse_multi_currency_options(df).enabled
	)


def parse_multi_currency_options(df):
	if not df or df.get("fieldtype") != "Currency":
		return frappe._dict({"enabled": False, "currency_field": ""})

	options = (df.get("options") or "").strip()
	if options == MULTI_CURRENCY_OPTION:
		return frappe._dict({"enabled": True, "currency_field": "currency"})

	prefix = f"{MULTI_CURRENCY_OPTION}:"
	if options.startswith(prefix):
		return frappe._dict(
			{"enabled": True, "currency_field": options[len(prefix) :].strip() or "currency"}
		)

	return frappe._dict({"enabled": False, "currency_field": ""})


def normalize_currency(currency=None, fallback=BASE_CURRENCY):
	return (currency or fallback or BASE_CURRENCY).strip().upper()


def parse_multi_currency_value(value):
	if isinstance(value, str):
		value = value.strip()
		if value.startswith("{"):
			try:
				value = json.loads(value)
			except ValueError:
				value = {}
		else:
			value = {"amount": value}
	elif not isinstance(value, dict):
		value = {"amount": value}

	currency = normalize_currency(value.get("currency"))
	base_currency = normalize_currency(value.get("base_currency"), BASE_CURRENCY)
	amount = flt(value.get("amount"))
	exchange_rate = 1 if currency == base_currency else flt(value.get("exchange_rate"))
	if currency != base_currency and amount > 0 and exchange_rate <= 0:
		raise ValueError(f"{currency} amount requires a valid exchange rate")
	base_amount = amount if currency == base_currency else flt(value.get("base_amount") or amount * exchange_rate)

	return frappe._dict(
		{
			"currency": currency,
			"amount": amount,
			"exchange_rate": exchange_rate,
			"base_currency": base_currency,
			"base_amount": base_amount,
		}
	)
