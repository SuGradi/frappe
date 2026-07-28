# Report View Inline Filter Enter And Blur Design

## Goal

Change every DocType Report View header filter from automatic 500 ms querying to explicit querying on Enter or when the input loses focus, while preserving server-side full-data filtering.

## Scope

- Apply globally in Frappe `ReportView`; no per-DocType customization.
- Change only the trigger behavior for the existing header filter inputs.
- Preserve filter parsing, permission checks, pagination, count queries, and stale-response protection.
- Keep ordinary List View and Query Report behavior unchanged.

## Interaction

- Typing in a `.dt-filter` input does not send a request.
- Pressing Enter in a header filter applies all current header filter values.
- Leaving a changed header filter applies all current header filter values.
- Clearing a filter requires Enter or blur before the full unfiltered result is requested.
- Enter followed by the browser's subsequent blur does not issue a duplicate request because the accepted filter state is unchanged.
- Non-Enter keys do not trigger a query.

## Implementation

Replace the debounced `input` event handler in `ReportView.bind_inline_filter_events()` with delegated `keydown` and `blur` handlers:

- `keydown`: run the existing apply function only when `event.key === "Enter"`; prevent the default Enter action.
- `blur`: run the same apply function immediately.
- The apply function continues to build validated server filters, restore accepted input values, compare against the last accepted state, reset `start` to zero, and call `refresh()` only when the state changed.
- Retain the existing event namespace and remove both handlers before rebinding so rerenders cannot accumulate listeners.

## Verification

- Source-level Node regression requires Enter and blur handlers and rejects the 500 ms debounce/input handler.
- Existing inline-filter translation, permissions, paging, count, and request-generation tests remain green.
- Build only the Frappe report/list assets needed by Report View.
- Verify the built report bundle contains Enter and blur handlers and no 500 ms inline-filter debounce.
- Activate on `sys.autohaina.com`, confirm HTTPS health, and leave unrelated repositories and sites untouched.
