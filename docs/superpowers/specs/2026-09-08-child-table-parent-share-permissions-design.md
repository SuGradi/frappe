# Child Table Parent Share Permissions

## Problem

Users who read parent documents only through `DocShare` can query parent fields but not child-table fields. `Meta.get_permitted_fieldnames()` checks the parent DocType for role permissions, then checks the child DocType for shared documents. Child rows are not shared independently, so permitted child fields collapse to framework fields only.

In Report View this has two visible effects:

- filtering a child field is rejected by `validate_filter_field_permission()`;
- selected child fields are removed by `DatabaseQuery.apply_fieldlevel_read_permissions()`, so formatted numeric values appear as zero.

## Design

When `Meta.get_permitted_fieldnames()` evaluates an `istable` DocType with `parenttype`, its share fallback will query shares for `parenttype`. Other calls will continue to query shares for `self.name`.

A matching parent share will add only permission level 0, preserving the existing restriction on higher permission levels. Query row restrictions and the Report View filter validator remain unchanged.

## Verification

Add a focused model-permission regression test proving that a user with a shared parent document, but no role-level parent read permission, receives permission-level-zero child fields when `parenttype` is supplied. The existing Report View filter-permission test continues to prove that genuinely unreadable fields are rejected.

No schema migration, permission-data change, asset build, cache clear, or service restart is required for the source change.
