# Bulk Attachment Delete Design

## Context

Frappe form sidebar attachments currently support only single-item deletion. The sidebar UI renders one visible attachment row at a time and the delete action calls `frappe.desk.form.utils.remove_attach`, which accepts only a single `fid` and deletes the corresponding `File` document.

The requirement is to support multi-select deletion from the form sidebar so users can remove multiple attachments in one action. Deletion semantics are strict: removing an attachment must delete the underlying `File` record and physical file data using the existing Frappe deletion flow.

## Goals

- Support batch deletion directly from the form sidebar attachments section.
- Keep the default attachment view unchanged until the user explicitly enters selection mode.
- Reuse the existing `File` deletion semantics so database records, comments, permissions, and physical file cleanup continue to behave as they do today.
- Return granular success and failure information for partial-delete scenarios.

## Non-Goals

- Adding bulk operations other than delete.
- Changing File List page behavior.
- Implementing attachment unlink-only semantics.
- Redesigning the broader form sidebar layout beyond the attachment controls needed for this feature.

## Current Behavior

- The sidebar attachment UI is implemented in `frappe/public/js/frappe/form/sidebar/attachments.js`.
- The attachment block template is in `frappe/public/js/frappe/form/templates/form_sidebar.html`.
- Sidebar attachment data comes from `frappe.desk.form.load.get_attachments`.
- Single-item deletion calls `frappe.desk.form.utils.remove_attach`.
- Server-side deletion uses `frappe.delete_doc("File", fid)`, which triggers `File.on_trash()` and `_delete_file_on_disk()`.

This existing chain is important because `_delete_file_on_disk()` already handles shared binary content via `content_hash`, deleting the disk file only when no other `File` records still reference the same content.

## Chosen Approach

Implement a new batch-delete flow in the form sidebar:

- Add a batch-delete icon to the attachment action row.
- Place the icon immediately to the left of the existing add-attachment icon.
- Clicking the batch-delete icon enters selection mode.
- In selection mode, each attachment row shows a checkbox.
- The action area switches to a selection toolbar with:
  - selected count
  - delete selected
  - cancel
- Deleting selected attachments calls a new server endpoint that accepts multiple `File` ids and deletes them one by one through `frappe.delete_doc`.

## Rejected Alternatives

### Frontend loop over existing single-delete endpoint

This is the smallest change but makes one network request per file and gives weaker feedback when some items fail and others succeed.

### Redirect users to File List for multi-select deletion

This reuses existing list multi-select behavior but fails the user experience goal of deleting directly from the document sidebar.

## UX Design

### Default State

- Attachment list appearance remains unchanged.
- No checkboxes are shown.
- Existing single delete and add attachment behavior continue to work.
- A new batch-delete icon button is visible to the left of the add attachment button.

### Selection Mode

- Clicking the batch-delete icon enters selection mode.
- Each rendered attachment row displays a checkbox on the left.
- The normal add button is hidden while in selection mode.
- The row-level single delete affordance is hidden or disabled while in selection mode to avoid mixing single and bulk delete interactions.
- The action area shows:
  - `Selected N`
  - `Delete Selected`
  - `Cancel`

### Confirmation

When the user clicks `Delete Selected`, show a confirmation dialog that clearly states:

- the operation will permanently delete the selected `File` records
- the corresponding physical file data will also be deleted when no other file record shares the same content
- the action cannot be undone

### Result Handling

- If all selected files are deleted successfully:
  - show a success message
  - exit selection mode
  - refresh the attachment list
- If some files fail:
  - show a partial success message
  - keep selection mode active
  - unselect or remove successfully deleted rows
  - keep failed rows selected for retry or review
- If all selected files fail:
  - stay in selection mode
  - keep current selection
  - show failure details

## Data Model and Rendering Rules

Selection must be keyed by `File.name`, not by `file_name`.

The current sidebar rendering deduplicates visible attachments by `file_name`. That behavior is incompatible with precise multi-select semantics because multiple `File` documents may share the same displayed file name. For this feature:

- each visible row must represent one `File` record
- checkboxes must map directly to `File.name`
- bulk deletion requests must send exact `File.name` values

If duplicate visual rows are considered undesirable, that can be revisited later with a separate UX decision, but this feature should prioritize deletion correctness over deduplicated display.

## Frontend Design

### Files

- `frappe/public/js/frappe/form/templates/form_sidebar.html`
- `frappe/public/js/frappe/form/sidebar/attachments.js`
- sidebar styles if needed in `frappe/public/scss/desk/sidebar.scss`

### Template Changes

Update the attachment action row to include:

- batch-delete icon button before the add attachment button
- a hidden selection toolbar container for selected count, delete selected, and cancel

### Attachment Sidebar State

Add client-side state in `Attachments`:

- `is_bulk_delete_mode`
- `selected_attachments`

Recommended methods:

- `setup_bulk_delete_actions()`
- `render_actions_state()`
- `enter_bulk_delete_mode()`
- `exit_bulk_delete_mode(clear_selection = true)`
- `toggle_attachment_selection(fileid, checked)`
- `get_selected_attachments()`
- `remove_attachments(fileids)`
- `sync_selected_attachments()`

### Refresh Flow

On refresh:

- synchronize selection against current docinfo attachments
- render the attachment rows
- render the correct action bar state

### Row Rendering

In selection mode:

- prepend a checkbox for each row
- restore checkbox state from `selected_attachments`
- suppress row-level delete affordance

Outside selection mode:

- keep today’s row rendering

## Backend Design

### File

- `frappe/desk/form/utils.py`

### New Endpoint

Add a new whitelisted endpoint, for example `remove_attachments`, accepting:

- `dt`
- `dn`
- `file_ids`

`file_ids` should be parsed as a JSON array of `File.name` values.

### Endpoint Behavior

1. Load the referenced document using `dt` and `dn`.
2. Validate that the user has permission to delete attachments for that document.
3. Load the requested `File` records.
4. Validate each file belongs to the same `attached_to_doctype` and `attached_to_name`.
5. For each valid file id, call `frappe.delete_doc("File", fid)`.
6. Collect per-file successes and failures.
7. Return a structured response.

### Response Shape

```json
{
  "deleted": ["FILE0001", "FILE0002"],
  "failed": [
    {
      "file_id": "FILE0003",
      "file_name": "test.pdf",
      "error": "This file is attached to a protected document and cannot be deleted."
    }
  ]
}
```

This shape is sufficient for the frontend to update local state and present partial-failure details.

## Permission Rules

The feature should follow the same delete affordance rules currently used by the sidebar:

- if `protect_attached_files` is false, require document `write`
- if `protect_attached_files` is true:
  - `docstatus = 0`: require `write`
  - `docstatus = 2`: require `write` and `delete`
  - `docstatus = 1`: do not allow deletion

These checks should remain in the frontend for button visibility and also be enforced in the backend as a security boundary.

The backend must not trust the client-supplied file list. It must verify:

- the document exists
- the current user has permission
- every requested file is attached to that document

Deletion should still flow through `frappe.delete_doc("File", fid)` so protected-file checks, comments, and physical file cleanup all remain centralized in the `File` doctype logic.

## Error Handling

The backend should not fail the entire request because one selected file cannot be deleted. Instead:

- delete what can be deleted
- collect failures with per-file reasons
- return both lists together

The frontend should summarize the result:

- all success: success toast and exit mode
- partial success: warning toast with failed item details and keep mode active
- all failed: error toast and keep mode active

## Testing

### Frontend / Cypress

Extend sidebar attachment tests to cover:

- batch-delete icon visibility when user can delete attachments
- entering selection mode
- selecting multiple attachments
- cancelling selection mode
- successful batch delete
- partial failure behavior if it can be simulated in test setup

### Backend / Python

Add server-side tests for:

- deleting multiple attachments from the same document
- rejecting file ids attached to a different document
- permission failure on protected or submitted documents
- partial success response shape

### File Cleanup

Ensure tests cover shared-file semantics:

- when two `File` records share the same `content_hash`, deleting one record does not remove the shared binary content prematurely
- deleting the last referencing record removes the physical file data

## Rollout Notes

- This feature is scoped only to the form sidebar attachment block.
- The first version should not add select-all, keyboard shortcuts, or additional batch actions.
- Keep the implementation focused on correct deletion semantics and clear feedback.

## Open Decisions Resolved

- Bulk delete entry is an icon button.
- The icon sits immediately to the left of the add attachment icon.
- Batch delete uses an explicit selection mode.
- Deletion is permanent and must remove underlying `File` records and disk content through the existing core deletion flow.

