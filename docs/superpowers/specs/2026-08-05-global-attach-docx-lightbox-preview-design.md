# Global Attach DOCX Lightbox Preview Design

## Goal

Allow `.docx` files in every Frappe `Attach` field to open inside the existing Fancybox attachment gallery. Word documents must render locally in the browser without sending contract contents to Microsoft, Google, or another third party.

## Scope

- Apply globally through `frappe.ui.form.ControlAttach`, including editable and read-only field displays and web forms that use the same control.
- Keep image and video behavior unchanged.
- Add `.docx` only. Legacy binary `.doc` files and PDF preview are out of scope.
- Do not change the form sidebar attachment list; it is not an `Attach` field and currently has separate preview behavior.
- Preserve normal file permissions. Public and private same-origin files must use the current Frappe session.

## Architecture

### Attachment classification

Extend the shared attachment lightbox helper with `is_docx_url()`. A DOCX URL becomes previewable and produces a Fancybox HTML item carrying the original file URL and filename. Existing image and HTML5 video items remain unchanged, so mixed attachment fields continue to form one gallery.

URL detection remains extension-based after normalization and query-string removal. Matching is case-insensitive and accepts only `.docx`.

### Lazy local renderer

Add `docx-preview` as an Apache-2.0 npm dependency of Frappe. Package it as a dedicated local `docx_preview.bundle.js` entry that exposes only the rendering function required by the attachment helper. Add a companion stylesheet bundle for the document viewport and its loading, error, retry, and download controls.

The common controls bundle must not include the DOCX parser. On the first DOCX preview, the helper resolves the hashed local bundle paths through `frappe.boot.assets_json`, injects the script and stylesheet, and caches the resulting promise. Resource loading must reject on failure rather than leave the preview permanently loading.

### Fancybox lifecycle

DOCX items use a stable HTML shell inside Fancybox. When Fancybox attaches or activates a DOCX slide, the helper:

1. Leaves the lightbox open and shows a compact loading state.
2. Fetches the original URL with same-origin credentials.
3. Rejects non-success HTTP responses and reads successful responses as an `ArrayBuffer`.
4. Calls `docx-preview` to render into a document container.
5. Marks the slide rendered so navigation back to it does not render it twice during the same Fancybox instance.

Only the active or newly attached DOCX slide is rendered. The implementation must not eagerly fetch every Word file in a multi-attachment field.

## User Experience

The preview uses a quiet document-reader layout consistent with Desk:

- The Word page is centered on a neutral viewport and remains vertically scrollable.
- A familiar download icon opens or downloads the original file and has an accessible label and tooltip.
- While loading, the document area has stable dimensions so the Fancybox layout does not jump.
- A failed dependency load, file request, or parse shows a concise error state with retry and download actions.
- Closing the lightbox aborts or harmlessly ignores stale rendering work so it cannot update detached DOM.

The existing Fancybox caption continues to display the filename. Images and videos retain their current zoom, playback, grouping, and navigation behavior.

## Security And Compatibility

- No document bytes are sent to external services.
- Same-origin fetches include the authenticated Frappe session, allowing private files only when the logged-in user is authorized.
- Cross-origin DOCX URLs work only when the source explicitly permits browser CORS; otherwise the error state offers the original link.
- Renderer output is confined to the dedicated preview container. No document-provided script is executed.
- Large or unusually complex Word files may render slowly; loading and failure states remain available and the original file is always downloadable.

## Error Handling

The UI distinguishes only actionable outcomes rather than exposing internal stack traces:

- Renderer asset failure: preview unavailable, retry and download available.
- HTTP or permission failure: file cannot be loaded, retry and download available.
- Invalid or unsupported DOCX content: document cannot be rendered, retry and download available.

Technical errors remain available in the browser console for diagnosis. Retrying resets the failed slide and repeats resource/file loading without reopening the form.

## Testing

Follow red-green-refactor development:

- URL detection accepts case-insensitive `.docx` with query strings and rejects `.doc`, `.pdf`, and misleading suffixes.
- Mixed URL and attachment lists include DOCX HTML items without changing image/video items.
- DOCX resources are lazy-loaded once and resource errors reach the preview error state.
- Rendering uses an authenticated fetch, handles HTTP errors, renders once per slide, and supports retry after failure.
- Non-DOCX links retain their existing default behavior.
- Existing attachment tests remain green.
- A production Frappe asset build succeeds and emits separate DOCX JS/CSS bundles.
- Live verification on `sys.autohaina.com` opens `/files/251085.docx` from `purchase_contract` inside Fancybox, renders visible document content, exposes download, and preserves image/video previews.

## Activation

Build Frappe assets, refresh the sys site asset metadata/cache as required by the bench, and verify the live hashed bundles before browser testing. No business document or File row is modified.

## Acceptance Criteria

- Clicking a `.docx` link in any `Attach` field opens Fancybox instead of a new browser tab.
- The document renders without a third-party viewer and without bypassing Frappe file permissions.
- Mixed image, video, and DOCX attachments remain navigable in one gallery.
- Loading, retry, failure, and original-download paths are usable on desktop and mobile widths.
- Existing attachment upload, multi-file display, selection, and deletion behavior does not regress.
