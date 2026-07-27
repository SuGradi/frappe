frappe.ui.form.ControlCurrency = class ControlCurrency extends frappe.ui.form.ControlFloat {
	bind_change_event() {
		if (!this.is_multi_currency()) {
			return super.bind_change_event();
		}

		const change_handler = (e) => {
			if (this.change) this.change(e);
			else {
				this.parse_validate_and_set_in_model(this.get_input_value(), e);
			}
		};
		this.$input.on("change", change_handler);
	}

	make_input() {
		super.make_input();
		if (!this.is_multi_currency()) {
			return;
		}
		this.setup_multi_currency_input();
	}

	refresh_input() {
		super.refresh_input();
		if (!this.is_multi_currency() || !this.$input || !$(this.input_area).is(":visible")) {
			return;
		}
		this.setup_multi_currency_input();
	}

	is_multi_currency() {
		return frappe.ui.form.multi_currency?.is_multi_currency_df(this.df);
	}

	setup_multi_currency_input() {
		const should_rebuild = frappe.ui.form.multi_currency.should_rebuild_multi_currency_input({
			has_wrapper: Boolean(this.$multi_currency_row?.length),
			input_inside_wrapper: Boolean(
				this.$input?.length
					&& this.$multi_currency_row?.length
					&& this.$input.closest(this.$multi_currency_row).length
			),
			picker_inside_wrapper: Boolean(
				this.$currency_picker?.length
					&& this.$multi_currency_row?.length
					&& this.$currency_picker.closest(this.$multi_currency_row).length
			),
			menu_inside_wrapper: Boolean(
				this.$currency_menu?.length
					&& this.$multi_currency_row?.length
					&& this.$currency_menu.closest(this.$multi_currency_row).length
			),
		});
		if (!should_rebuild) {
			return;
		}

		this.reset_multi_currency_input_shell();
		this.$multi_currency_row = $(
			`<div class="multi-currency-control" style="position: relative;"></div>`
		);
		this.$currency_picker = $(
			`<button type="button" class="btn btn-default btn-xs multi-currency-picker" style="position: absolute; left: 6px; top: 50%; transform: translateY(-50%); min-width: 64px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;"></button>`
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
		this.$input.after(this.$currency_picker);
		this.$currency_picker.after(this.$currency_menu);
		this.$input.css("padding-left", "82px");
		this.set_selected_currency(this.get_document_currency(), {
			update_doc: this.should_initialize_document_currency(),
		});

		this.$currency_picker.on("click.multi-currency-control", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!this.is_multi_currency_editable()) {
				this.$currency_menu.hide();
				return;
			}
			this.$currency_menu.toggle();
		});
		this.$currency_menu.on("click.multi-currency-control", "[data-currency]", (event) => {
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
		this.$input.off(".multi-currency-control");
		this.$input.on("blur.multi-currency-control", () => {
			this.refresh_multi_currency_state();
		});
		$("body").off(`click.multi-currency-${this.df.fieldname}`);
		$("body").on(`click.multi-currency-${this.df.fieldname}`, () => {
			this.$currency_menu?.hide();
		});
		this.refresh_multi_currency_picker_state();
	}

	reset_multi_currency_input_shell() {
		this.$currency_picker?.remove();
		this.$currency_menu?.remove();

		if (this.$multi_currency_row?.length) {
			if (this.$input?.length && this.$input.closest(this.$multi_currency_row).length) {
				this.$input.css("padding-left", "");
				this.$input.unwrap(".multi-currency-control");
			} else {
				this.$multi_currency_row.remove();
			}
		}

		this.$multi_currency_row = null;
		this.$currency_picker = null;
		this.$currency_menu = null;
	}

	open_multi_currency_menu() {
		if (!this.is_multi_currency_editable() || !this.$currency_menu?.length) {
			return false;
		}
		this.$currency_menu.show();
		return true;
	}

	ensure_multi_currency_base_amount_line() {
		const $input_wrapper = this.$wrapper.find(".control-input-wrapper");
		if (
			this.$base_amount_line?.length
			&& $input_wrapper.length
			&& this.$base_amount_line.closest($input_wrapper).length
		) {
			return this.$base_amount_line;
		}
		this.$base_amount_line?.remove();
		this.$base_amount_line = $(
			`<div class="multi-currency-base small text-muted" style="margin-top: 4px;"></div>`
		);
		$input_wrapper.append(this.$base_amount_line);
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
		const previous_currency = this.get_selected_currency();
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
			if (normalized_currency && normalized_currency !== previous_currency) {
				this.clear_cached_exchange_rate(normalized_currency);
			}
			frappe.ui.form.multi_currency.set_document_currency({
				frm: this.frm,
				doc: this.doc,
				doctype: this.doctype,
				docname: this.docname,
				currency_field: this.get_currency_field(),
				currency: normalized_currency,
			});
		}
		if (frappe.ui.form.multi_currency.get_counter_currency(normalized_currency)) {
			this.get_exchange_rate(normalized_currency);
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
		if (
			normalized.currency === "USD" &&
			flt(normalized.exchange_rate) > 0
		) {
			this.set_cached_exchange_rate(normalized.currency, normalized.exchange_rate);
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
			exchange_rate: this.get_cached_exchange_rate(this.get_selected_currency()),
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
		if (
			frappe.ui.form.multi_currency.get_counter_currency(input_value.currency) &&
			flt(input_value.amount) > 0 &&
			!flt(input_value.exchange_rate)
		) {
			const rate = await this.get_exchange_rate(input_value.currency);
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

		const rate = await this.get_exchange_rate(currency);
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
				exchange_rate: rate,
				precision: this.get_precision(),
			})
		).attr(
			"title",
			frappe.ui.form.multi_currency.format_conversion_rate_title({
				amount,
				currency,
				exchange_rate: rate,
			})
		);
	}

	async refresh_multi_currency_read_only_state(value) {
		this.ensure_multi_currency_base_amount_line();
		const parsed = this.parse_saved_multi_currency_value(value);
		const currency = parsed.currency || this.get_document_currency();
		const amount = flt(parsed.amount);
		if (
			frappe.ui.form.multi_currency.should_cache_saved_exchange_rate(
				currency,
				parsed.exchange_rate
			)
		) {
			this.set_cached_exchange_rate(currency, parsed.exchange_rate);
		}
		if (!amount) {
			this.$base_amount_line?.text("").removeAttr("title");
			return;
		}
		if (!frappe.ui.form.multi_currency.get_counter_currency(currency)) {
			this.$base_amount_line?.text("").removeAttr("title");
			return;
		}

		const rate = await this.get_exchange_rate(currency);
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
				exchange_rate: rate,
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

	normalize_exchange_currency(currency) {
		const normalized_currency = frappe.ui.form.multi_currency.get_exchange_rate_args(currency).from_currency;
		return normalized_currency === "CNY" ? "USD" : normalized_currency;
	}

	get_cached_exchange_rate(currency) {
		const normalized_currency = this.normalize_exchange_currency(currency);
		if (!frappe.ui.form.multi_currency.get_counter_currency(normalized_currency)) {
			return 1;
		}
		return flt(this.exchange_rates?.[normalized_currency]);
	}

	set_cached_exchange_rate(currency, rate) {
		const normalized_currency = this.normalize_exchange_currency(currency);
		if (!frappe.ui.form.multi_currency.get_counter_currency(normalized_currency)) {
			return 1;
		}
		this.exchange_rates = this.exchange_rates || {};
		this.exchange_rates[normalized_currency] = flt(rate);
		return this.exchange_rates[normalized_currency];
	}

	clear_cached_exchange_rate(currency) {
		const normalized_currency = this.normalize_exchange_currency(currency);
		if (this.exchange_rates) {
			delete this.exchange_rates[normalized_currency];
		}
		if (this.exchange_rate_promises) {
			delete this.exchange_rate_promises[normalized_currency];
		}
	}

	get_exchange_rate(currency) {
		const normalized_currency = this.normalize_exchange_currency(currency);
		if (!frappe.ui.form.multi_currency.get_counter_currency(normalized_currency)) {
			return Promise.resolve(1);
		}
		const document_exchange_rate = this.get_document_exchange_rate(normalized_currency);
		if (document_exchange_rate > 0) {
			this.set_cached_exchange_rate(normalized_currency, document_exchange_rate);
			return Promise.resolve(document_exchange_rate);
		}
		const cached_rate = this.get_cached_exchange_rate(normalized_currency);
		if (cached_rate > 0) {
			return Promise.resolve(cached_rate);
		}
		this.exchange_rate_promises = this.exchange_rate_promises || {};
		if (this.exchange_rate_promises[normalized_currency]) {
			return this.exchange_rate_promises[normalized_currency];
		}

		this.exchange_rate_promises[normalized_currency] = new Promise((resolve) => {
			frappe.call({
				method: "erpnext.setup.utils.get_exchange_rate",
				args: frappe.ui.form.multi_currency.get_exchange_rate_args(normalized_currency),
				callback: (response) => {
					const rate = this.set_cached_exchange_rate(normalized_currency, response.message);
					if (!rate) {
						this.exchange_rate_promises[normalized_currency] = null;
					}
					resolve(rate);
				},
				error: () => {
					this.exchange_rate_promises[normalized_currency] = null;
					resolve(0);
				},
			});
		});
		return this.exchange_rate_promises[normalized_currency];
	}

	get_document_exchange_rate(currency) {
		const normalized_currency = this.normalize_exchange_currency(currency);
		if (normalized_currency !== "USD") {
			return 0;
		}
		return frappe.ui.form.multi_currency.get_document_usd_cny_rate(
			this.doc,
			this.frm?.doc
		);
	}

	get_usd_cny_rate() {
		return this.get_exchange_rate("USD");
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
