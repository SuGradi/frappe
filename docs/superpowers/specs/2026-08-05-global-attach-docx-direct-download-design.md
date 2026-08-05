# Global Attach DOCX Direct Download Design

## Goal

Make every Frappe `Attach` field download `.docx` files directly when clicked. DOCX files must not open in Fancybox or a new browser tab. Image and video attachment previews must remain unchanged.

## Scope

- Apply globally through the shared `ControlAttach` implementation.
- Keep case-insensitive `.docx` detection.
- Exclude `.docx` from Fancybox preview groups.
- Preserve existing image and video Fancybox behavior.
- Preserve existing behavior for PDF, `.doc`, and other attachment types.
- Do not modify File rows, business documents, permissions, or attachment bytes.

## Architecture

The shared attachment helper will continue to identify DOCX URLs, but `is_previewable_url()` will classify only images and videos. After each attachment list is rendered, the existing `bind_attachment_lightbox()` path will normalize DOCX anchors by removing `target="_blank"` and setting `download` to the decoded original filename. Because DOCX is no longer previewable, the delegated Fancybox click handler will leave the event untouched and the browser will perform its native same-origin download.

This uses one shared normalization point for both single-value and multiple-value `Attach` render paths. It avoids duplicating DOCX-specific markup across the two attachment list templates.

## Removal Boundary

The local DOCX preview stack is no longer needed and will be removed completely:

- `docx-preview` runtime dependency and lockfile entries.
- `docx_preview.bundle.js` and its bundle test.
- `docx_preview.bundle.scss`.
- DOCX shell construction, lazy asset loading, authenticated fetch, rendering state, retry, and Fancybox slide lifecycle code.
- Preview-specific tests and expectations.

The historical design and implementation-plan documents remain in Git history as decision records. They are not runtime code and do not affect assets.

## Interaction Flow

1. `ControlAttach` renders its attachment links.
2. `bind_attachment_lightbox()` inspects each `.attached-file-link`.
3. For a DOCX link, it removes the new-tab target and sets `download` to the original filename.
4. The click handler sees that DOCX is not previewable and does not call `preventDefault()`.
5. The browser downloads the same-origin file with the current authenticated session.
6. Image and video clicks continue into Fancybox exactly as before.

## Error Handling

Native browser and server download behavior remains authoritative. A missing file or permission failure follows the existing HTTP response path; no client-side preview error or retry UI remains. Private-file authentication continues through the normal same-origin link request.

## Testing

Focused Node tests will prove:

- `.docx` detection remains case-insensitive.
- DOCX is not previewable and is absent from mixed Fancybox item groups.
- DOCX anchors receive the original filename in `download` and lose `_blank`.
- Image and video grouping, media types, and Fancybox start index remain unchanged.
- No DOCX preview bundle, stylesheet, renderer global, or dependency reference remains in runtime source and package metadata.

Production verification will include JavaScript syntax, whitespace checks, a Frappe production build, asset-manifest inspection, sys-only cache clearing, bench restart, Supervisor health, sys ping, and HTTP availability of the current controls bundle. Browser interaction will be tested manually by the user.

## Rollout

Build Frappe production assets, clear only `sys.autohaina.com` cache, restart the bench processes, and verify sys health. No migration or business-data change is required.
