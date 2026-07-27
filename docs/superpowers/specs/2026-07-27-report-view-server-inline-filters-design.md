# Report View Server-Side Inline Filters Design

## Goal

Make the inline column filters directly below the headers in every DocType Report View query all permitted records, instead of filtering only the rows already loaded in the browser.

## Scope

- Apply to `frappe.views.ReportView` for all DocTypes, including saved Report Builder reports.
- Keep ordinary List View and Query Report behavior unchanged.
- Preserve the existing inline filter row and its per-column interaction model.
- Do not change the separate standard filters above the report or the filter-button workflow.

## Interaction

- Apply a filter after the user stops typing for 500 ms.
- Keep entered inline values visible while data refreshes.
- Combine filters from different columns with AND.
- Reset to the first page whenever an inline filter changes.
- Keep the same inline filters when the user selects another page length or clicks Load More.
- Clearing all inline filters restores the unfiltered report result.
- Only the latest filter state may update the table; an older, slower response must not overwrite newer results.

## Filter Semantics

Translate the existing DataTable syntax into Frappe report-view filters against the raw field value:

| Input | Server condition |
|---|---|
| text | `like %text%` |
| `>value` | `>` |
| `<value` | `<` |
| `=value` | `=` |
| `!=value` | `!=` |
| `start:end` | `between [start, end]` |

Whitespace around explicit operators and range endpoints is ignored. Empty values do not create filters. Multiple column conditions are appended to the standard filter-area conditions, so both sets apply together.

Filtering targets stored/raw values. Values added only by a client formatter are not independently searchable unless they correspond to the underlying field value.

## Architecture

Add the behavior at the Frappe `ReportView` boundary rather than in an individual DocType or an Autohaina monkey patch.

1. The DataTable inline-filter callback forwards the current column-index/value map to `ReportView`.
2. `ReportView` maps each filterable DataTable column back to its DocType and fieldname, translates the expression, stores the resulting inline filters separately from visible standard filters, and refreshes from `start = 0`.
3. `get_filters_for_args()` appends the stored inline filters to the existing standard filters. The existing `frappe.desk.reportview.get` endpoint applies them before pagination.
4. The refreshed rows replace the current table data on the first page. Load More continues to append rows using the same stored filter state.
5. A request-generation guard ensures stale responses cannot become the final rendered state.

Checkbox, row-number, aggregate-only, and other columns that cannot be mapped to a permitted database field do not produce a server filter. Their input must not silently fall back to filtering only the loaded page; unsupported filter input is ignored and cleared.

## Error Handling

- Invalid or unsupported inline expressions must not issue a malformed database query.
- A failed request leaves the previous rows and current filter text intact and uses the existing Frappe request error presentation.
- Clearing or correcting the input issues a new request normally.

## Tests

Add focused JavaScript tests before implementation for:

- text and comparison/range expression translation;
- multiple inline filters combined with existing standard filters;
- child-table column mapping;
- first-page reset and filter persistence across Load More;
- clearing filters;
- unsupported columns;
- latest-request-wins behavior.

Run the focused Report View JavaScript suite, the relevant broader Frappe frontend suite, formatting/lint checks for changed files, and a production build. Runtime activation is a separate step and must not be assumed solely from source/build verification.
