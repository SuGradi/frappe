frappe.ui.form.ControlCurrency = class ControlCurrency extends frappe.ui.form.ControlFloat {
	make_input() {
		super.make_input();
		if (!this.is_multi_currency()) {
			return;
		}
		this.setup_multi_currency_input();
	}

	is_multi_currency() {
		return frappe.ui.form.multi_currency?.is_multi_currency_df(this.df);
	}

	setup_multi_currency_input() {
		if (this.$multi_currency_row) {
			return;
		}

		this.$multi_currency_row = $(
			`<div class="multi-currency-control" style="position: relative;"></div>`
		);
		this.$currency_picker = $(
			`<button type="button" class="btn btn-default btn-xs multi-currency-picker" style="position: absolute; left: 6px; top: 50%; transform: translateY(-50%); z-index: 2; min-width: 64px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;"></button>`
		);
		this.$currency_menu = $(
			`<div class="dropdown-menu multi-currency-menu" style="position: absolute; left: 0; top: calc(100% + 2px); z-index: 1000;"></div>`
		).hide();
		this.ensure_multi_currency_base_amount_line();

		for (const currency of this.get_currency_options()) {
			this.$currency_menu.append(
				`<button type="button" class="dropdown-item" data-currency="${currency}">${currency}</button>`
			);
		}

		this.$input.wrap(this.$multi_currency_row);
		this.$input.before(this.$currency_picker);
		this.$input.after(this.$currency_menu);
		this.$input.css("padding-left", "82px");
		this.set_selected_currency(this.get_document_currency(), {
			update_doc: this.should_initialize_document_currency(),
		});

		const refresh_conversion_line = frappe.utils.debounce(() => this.refresh_multi_currency_state(), 300);
		this.$currency_picker.on("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!this.is_multi_currency_editable()) {
				this.$currency_menu.hide();
				return;
			}
			this.$currency_menu.toggle();
		});
		this.$currency_menu.on("click", "[data-currency]", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!this.is_multi_currency_editable()) {
				this.$currency_menu.hide();
				return;
			}
			const currency = $(event.currentTarget).attr("data-currency");
			this.set_selected_currency(currency, { update_doc: true });
			this.$currency_menu.hide();
			this.refresh_multi_currency_state().then(() => {
				this.parse_validate_and_set_in_model(this.get_input_value());
			});
		});
		this.$input.on("input", () => {
			this.frm?.dirty?.();
			refresh_conversion_line();
		});
		$("body").on(`click.multi-currency-${this.df.fieldname}`, () => {
			this.$currency_menu?.hide();
		});
		this.refresh_multi_currency_picker_state();
	}

	ensure_multi_currency_base_amount_line() {
		if (this.$base_amount_line) {
			return this.$base_amount_line;
		}
		this.$base_amount_line = $(
			`<div class="multi-currency-base small text-muted" style="margin-top: 4px;"></div>`
		);
		this.$wrapper.find(".control-input-wrapper").append(this.$base_amount_line);
		return this.$base_amount_line;
	}

	get_currency_options() {
		return frappe.ui.form.multi_currency.get_currency_options();
	}

	get_multi_currency_options() {
		return frappe.ui.form.multi_currency.parse_multi_currency_options(this.df);
	}

	get_currency_field() {
		return this.get_multi_currency_options().currency_field || "currency";
	}

	get_document_currency() {
		const currency = this.doc?.[this.get_currency_field()];
		return this.get_currency_options().includes(currency) ? currency : "CNY";
	}

	get_selected_currency() {
		return this.$currency_picker?.attr("data-currency") || this.get_document_currency();
	}

	should_initialize_document_currency() {
		const currency_field = this.get_currency_field();
		return Boolean(this.frm && currency_field && !this.doc?.[currency_field]);
	}

	set_selected_currency(currency, { update_doc = false } = {}) {
		const normalized_currency = this.get_currency_options().includes(currency) ? currency : "";
		const label = normalized_currency || __("币种");
		this.$currency_picker
			?.attr("data-currency", normalized_currency)
			.html(
				`<span class="multi-currency-code">${label}</span>${frappe.utils.icon(
					"down",
					"xs"
				)}`
			);
		this.refresh_multi_currency_picker_state();
		if (update_doc && this.frm && this.get_currency_field()) {
			frappe.ui.form.multi_currency.set_document_currency({
				frm: this.frm,
				doc: this.doc,
				doctype: this.doctype,
				docname: this.docname,
				currency_field: this.get_currency_field(),
				currency: normalized_currency,
			});
		}
		if (normalized_currency === "USD") {
			this.get_usd_cny_rate();
		}
		return normalized_currency;
	}

	is_multi_currency_editable() {
		return this.disp_status === "Write" && !cint(this.df.read_only);
	}

	refresh_multi_currency_picker_state() {
		if (!this.$currency_picker) {
			return;
		}
		const editable = this.is_multi_currency_editable();
		this.$currency_picker
			.prop("disabled", !editable)
			.attr("aria-disabled", editable ? "false" : "true")
			.toggleClass("disabled", !editable);
		if (!editable) {
			this.$currency_menu?.hide();
		}
	}

	set_formatted_input(value) {
		if (!this.is_multi_currency()) {
			return super.set_formatted_input(value);
		}
		if (!this.$input) {
			return;
		}
		const parsed = this.parse_saved_multi_currency_value(value);
		const normalized = {
			currency: parsed.currency || this.get_document_currency(),
			amount: parsed.amount,
			exchange_rate: parsed.exchange_rate,
		};
		const document_exchange_rate = frappe.ui.form.multi_currency.get_document_usd_cny_rate(
			this.doc,
			this.frm?.doc
		);
		if (document_exchange_rate > 0) {
			this.usd_cny_rate = document_exchange_rate;
			this.usd_cny_rate_promise = null;
		} else if (normalized.currency === "USD" && flt(normalized.exchange_rate) > 0) {
			this.usd_cny_rate = flt(normalized.exchange_rate);
		}
		this.set_selected_currency(normalized.currency, {
			update_doc: this.should_initialize_document_currency(),
		});
		this.refresh_multi_currency_picker_state();
		this.$input.val(this.format_for_input(normalized.amount));
		this.refresh_multi_currency_state(normalized);
	}

	set_disp_area(value) {
		super.set_disp_area(value);
		if (!this.is_multi_currency()) {
			return;
		}
		if (this.$input && $(this.input_area).is(":visible")) {
			return;
		}
		this.refresh_multi_currency_read_only_state(value);
	}

	get_input_value() {
		if (!this.is_multi_currency()) {
			return super.get_input_value();
		}
		return frappe.ui.form.multi_currency.get_multi_currency_input_value({
			currency: this.get_selected_currency(),
			amount: this.$input?.val(),
			usd_cny_rate: this.usd_cny_rate || 0,
		});
	}

	parse(value) {
		if (!this.is_multi_currency()) {
			return super.parse(value);
		}
		if (this.df.is_filter) {
			return frappe.ui.form.multi_currency.serialize_multi_currency_filter_value(value);
		}
		return frappe.ui.form.multi_currency.serialize_multi_currency_value(value);
	}

	validate(value) {
		if (!this.is_multi_currency()) {
			return super.validate(value);
		}
		return value;
	}

	async parse_validate_and_set_in_model(value, e) {
		if (!this.is_multi_currency()) {
			return super.parse_validate_and_set_in_model(value, e);
		}

		const parsed_value = await this.get_parsed_multi_currency_input(value);
		return this.validate_and_set_in_model(parsed_value, e);
	}

	async flush_multi_currency_input() {
		const parsed_value = await this.get_parsed_multi_currency_input(this.get_input_value());
		return this.validate_and_set_in_model(parsed_value, null, true);
	}

	async get_parsed_multi_currency_input(value) {
		const input_value = value || this.get_input_value();
		if (input_value.currency === "USD" && flt(input_value.amount) > 0 && !flt(input_value.exchange_rate)) {
			const rate = await this.get_usd_cny_rate();
			input_value.exchange_rate = rate;
		}
		return this.parse(input_value);
	}

	async refresh_multi_currency_state(value) {
		if (!this.is_multi_currency()) {
			return;
		}
		this.ensure_multi_currency_base_amount_line();
		this.refresh_multi_currency_picker_state();
		const current = value || this.get_input_value();
		const currency = this.set_selected_currency(current.currency || this.get_document_currency());
		const amount = flt(current.amount);
		const target_currency = frappe.ui.form.multi_currency.get_counter_currency(currency);
		if (!target_currency) {
			this.$base_amount_line?.text("").removeAttr("title");
			return;
		}

		const rate = await this.get_usd_cny_rate();
		if (!rate) {
			this.$base_amount_line?.text(__("Missing exchange rate")).removeAttr("title");
			return;
		}
		if (!amount) {
			this.$base_amount_line?.text("").removeAttr("title");
			return;
		}
		this.$base_amount_line?.text(
			frappe.ui.form.multi_currency.format_conversion_line({
				amount,
				currency,
				usd_cny_rate: rate,
				precision: this.get_precision(),
			})
		).attr(
			"title",
			frappe.ui.form.multi_currency.format_conversion_rate_title({
				amount,
				currency,
				usd_cny_rate: rate,
			})
		);
	}

	async refresh_multi_currency_read_only_state(value) {
		this.ensure_multi_currency_base_amount_line();
		const parsed = this.parse_saved_multi_currency_value(value);
		const currency = parsed.currency || this.get_document_currency();
		const amount = flt(parsed.amount);
		const document_exchange_rate = frappe.ui.form.multi_currency.get_document_usd_cny_rate(
			this.doc,
			this.frm?.doc
		);
		if (document_exchange_rate > 0) {
			this.usd_cny_rate = document_exchange_rate;
			this.usd_cny_rate_promise = null;
		} else if (currency === "USD" && flt(parsed.exchange_rate) > 0) {
			this.usd_cny_rate = flt(parsed.exchange_rate);
		}
		if (!amount) {
			this.$base_amount_line?.text("").removeAttr("title");
			return;
		}

		const rate = await this.get_usd_cny_rate();
		this.$base_amount_line?.text(
			frappe.ui.form.multi_currency.format_saved_value_conversion_line(
				{ ...parsed, currency },
				rate,
				this.get_precision()
			)
		).attr(
			"title",
			frappe.ui.form.multi_currency.format_conversion_rate_title({
				amount,
				currency,
				usd_cny_rate: rate,
			})
		);
	}

	parse_saved_multi_currency_value(value) {
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
		return { amount: value, currency: "CNY" };
	}

	get_usd_cny_rate() {
		const document_exchange_rate = frappe.ui.form.multi_currency.get_document_usd_cny_rate(
			this.doc,
			this.frm?.doc
		);
		if (document_exchange_rate > 0) {
			this.usd_cny_rate = document_exchange_rate;
			this.usd_cny_rate_promise = null;
			return Promise.resolve(this.usd_cny_rate);
		}
		if (this.usd_cny_rate > 0) {
			return Promise.resolve(this.usd_cny_rate);
		}
		if (this.usd_cny_rate_promise) {
			return this.usd_cny_rate_promise;
		}

		this.usd_cny_rate_promise = new Promise((resolve) => {
			frappe.call({
				method: "erpnext.setup.utils.get_exchange_rate",
				args: frappe.ui.form.multi_currency.get_usd_cny_exchange_rate_args(this.doc),
				callback: (response) => {
					this.usd_cny_rate = flt(response.message);
					if (!this.usd_cny_rate) {
						this.usd_cny_rate_promise = null;
					}
					resolve(this.usd_cny_rate);
				},
				error: () => {
					this.usd_cny_rate_promise = null;
					resolve(0);
				},
			});
		});
		return this.usd_cny_rate_promise;
	}

	get_precision() {
		// always round based on field precision or currency's precision
		// this method is also called in this.parse()
		if (typeof this.df.precision != "number" && !this.df.precision) {
			if (frappe.boot.sysdefaults.currency_precision) {
				this.df.precision = frappe.boot.sysdefaults.currency_precision;
			} else {
				this.df.precision = get_number_format_info(this.get_number_format()).precision;
			}
		}

		return this.df.precision;
	}
};
