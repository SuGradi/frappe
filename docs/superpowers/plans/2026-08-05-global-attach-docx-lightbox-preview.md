# Global Attach DOCX Lightbox Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.docx` files in every Frappe `Attach` field render locally inside the existing Fancybox gallery while preserving permissions, downloads, and image/video behavior.

**Architecture:** Extend the existing attachment lightbox helper with DOCX classification, HTML-slide construction, lazy asset loading, authenticated fetching, and render/error lifecycle handling. Package `docx-preview` in a separate local bundle so ordinary controls do not load the parser, and style its Fancybox slide with a separate lazy stylesheet.

**Tech Stack:** Frappe v15 JavaScript, Fancybox 6.1.13, `docx-preview` 0.4.0, SCSS, Node.js built-in test runner, Yarn 1, esbuild.

---

## File Structure

- Modify `package.json`: add the exact `docx-preview` runtime dependency.
- Modify `yarn.lock`: lock `docx-preview` and its transitive dependencies.
- Create `frappe/public/js/docx_preview.bundle.js`: expose `docx-preview.renderAsync` as `globalThis.frappeDocxPreview.renderAsync` in an independently built local asset.
- Create `frappe/public/js/docx_preview.bundle.test.js`: verify the local bundle exposes the actual renderer.
- Create `frappe/public/scss/docx_preview.bundle.scss`: provide the stable document viewport, toolbar, loading, error, desktop, and mobile presentation.
- Modify `frappe/public/js/frappe/form/controls/attach.js`: recognize DOCX, build mixed Fancybox items, lazy-load hashed renderer assets, fetch protected files, render slides, retry failures, and preserve downloads.
- Modify `frappe/public/js/frappe/form/controls/attach.test.js`: cover classification, grouping, start index, resource loading, authenticated fetch, successful rendering, duplicate-render prevention, and retryable errors.
- Update `/www/haina/frappe-bench/task_plan.md`, `/www/haina/frappe-bench/findings.md`, and `/www/haina/frappe-bench/progress.md`: record red/green/build/runtime evidence without committing these bench-level working notes.

### Task 1: Add The Local DOCX Renderer Bundle

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Create: `frappe/public/js/docx_preview.bundle.test.js`
- Create: `frappe/public/js/docx_preview.bundle.js`

- [ ] **Step 1: Add the exact dependency without Corepack metadata churn**

Run from `apps/frappe`:

```bash
COREPACK_ENABLE_PROJECT_SPEC=0 yarn add --exact docx-preview@0.4.0
```

Expected: `package.json` contains `"docx-preview": "0.4.0"`, `yarn.lock` contains its lock entry, and no `packageManager` field is added.

- [ ] **Step 2: Write the failing bundle exposure test**

Create `frappe/public/js/docx_preview.bundle.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");

test("local DOCX bundle exposes the docx-preview renderer", () => {
	delete globalThis.frappeDocxPreview;
	delete require.cache[require.resolve("./docx_preview.bundle.js")];
	require("./docx_preview.bundle.js");

	assert.equal(typeof globalThis.frappeDocxPreview?.renderAsync, "function");
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --test frappe/public/js/docx_preview.bundle.test.js
```

Expected: FAIL because `docx_preview.bundle.js` does not exist.

- [ ] **Step 4: Implement the minimal renderer bundle**

Create `frappe/public/js/docx_preview.bundle.js`:

```javascript
const { renderAsync } = require("docx-preview");

globalThis.frappeDocxPreview = { renderAsync };
```

- [ ] **Step 5: Run the test and verify GREEN**

Run the same Node test. Expected: 1 test passes with no warnings.

- [ ] **Step 6: Commit the dependency and bundle**

```bash
git add package.json yarn.lock frappe/public/js/docx_preview.bundle.js frappe/public/js/docx_preview.bundle.test.js
git commit -m "功能：添加本地 DOCX 预览渲染包"
```

### Task 2: Classify DOCX And Build Mixed Gallery Items

**Files:**
- Modify: `frappe/public/js/frappe/form/controls/attach.test.js`
- Modify: `frappe/public/js/frappe/form/controls/attach.js`

- [ ] **Step 1: Write failing classification and item tests**

Extend the first helper test with:

```javascript
assert.equal(helper.is_docx_url("/files/demo.docx"), true);
assert.equal(helper.is_docx_url("/files/DEMO.DOCX?version=2"), true);
assert.equal(helper.is_docx_url("/files/demo.doc"), false);
assert.equal(helper.is_docx_url("/files/demo.docx.exe"), false);
assert.equal(helper.is_previewable_url("/files/demo.docx"), true);
```

Change grouped-item expectations so `/files/b.docx` produces:

```javascript
{
	src: helper.get_docx_shell_html(),
	type: "html",
	caption: "b.docx",
	docxUrl: "/files/b.docx",
}
```

For attachment objects, require `caption: "B 文档"` with the same `docxUrl`. Add a start-index assertion proving `open(items, "/files/b.docx")` selects the DOCX item by `docxUrl`, not by its HTML `src`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js
```

Expected: FAIL because `is_docx_url()` and `get_docx_shell_html()` do not exist and DOCX remains filtered out.

- [ ] **Step 3: Implement minimal DOCX classification and item construction**

Add these helper responsibilities in `attach.js`:

```javascript
is_docx_url(url) {
	const normalized = this.normalize_url(url).split("?")[0].toLowerCase();
	return /\.docx$/.test(normalized);
},
is_previewable_url(url) {
	return this.is_image_url(url) || this.is_video_url(url) || this.is_docx_url(url);
},
get_docx_shell_html() {
	return `
		<div class="attachment-docx-preview" data-docx-preview>
			<div class="attachment-docx-toolbar">
				<a class="btn btn-default btn-sm btn-icon" data-docx-download target="_blank"
					title="${__("下载原文件")}" aria-label="${__("下载原文件")}">
					${frappe.utils.icon("es-line-download", "sm")}
				</a>
			</div>
			<div class="attachment-docx-viewport">
				<div class="attachment-docx-status" data-docx-loading>${__("正在加载文档")}</div>
				<div class="attachment-docx-status hidden" data-docx-error>
					<span>${__("文档无法预览")}</span>
					<div class="attachment-docx-error-actions">
						<button class="btn btn-default btn-sm btn-icon" data-docx-retry
							title="${__("重试")}" aria-label="${__("重试")}">
							${frappe.utils.icon("refresh", "sm")}
						</button>
					</div>
				</div>
				<div class="attachment-docx-content hidden" data-docx-content></div>
				<div class="attachment-docx-styles" data-docx-styles></div>
			</div>
		</div>`;
},
get_item_url(item) {
	return item?.docxUrl || item?.src || "";
},
```

In `build_item()`, return the HTML item before the existing image/video path when `is_docx_url(url)` is true. In `open()`, compute `startIndex` from `get_item_url(item)`.

- [ ] **Step 4: Run focused and existing tests and verify GREEN**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js
node --check frappe/public/js/frappe/form/controls/attach.js
```

Expected: all attachment tests pass and syntax validation exits zero.

- [ ] **Step 5: Commit classification and grouping**

```bash
git add frappe/public/js/frappe/form/controls/attach.js frappe/public/js/frappe/form/controls/attach.test.js
git commit -m "功能：将 DOCX 加入附件灯箱分组"
```

### Task 3: Lazy-Load And Render DOCX Slides

**Files:**
- Modify: `frappe/public/js/frappe/form/controls/attach.test.js`
- Modify: `frappe/public/js/frappe/form/controls/attach.js`

- [ ] **Step 1: Add failing lifecycle tests**

Add small fake nodes in the Node test and cover these concrete contracts:

```javascript
const response = {
	ok: true,
	arrayBuffer: async () => new ArrayBuffer(8),
};
const calls = [];
helper.fetch_file = async (url, options) => {
	calls.push([url, options]);
	return response;
};
helper.ensure_docx_resources = async () => ({
	renderAsync: async (buffer, content, styles, options) => {
		calls.push([buffer, content, styles, options]);
	},
});

await helper.render_docx_slide(slide);
assert.deepEqual(calls[0], ["/private/files/contract.docx", { credentials: "same-origin" }]);
assert.equal(slide.docxRenderState, "rendered");
await helper.render_docx_slide(slide);
assert.equal(calls.filter((call) => call[0] === "/private/files/contract.docx").length, 1);
```

Also assert:

- `ensure_docx_resources()` reuses one promise while loading and clears it after a rejected load so retry can create a new request.
- An HTTP 403 response sets `slide.docxRenderState` to `error`, shows the error state, and does not call `renderAsync`.
- Calling the retry action with `force: true` clears the content, fetches again, and can reach `rendered`.
- The Fancybox `Carousel.attachSlideEl` callback calls `prepare_docx_slide()` only for items with `docxUrl`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js
```

Expected: FAIL because DOCX resource and render lifecycle methods do not exist.

- [ ] **Step 3: Implement hashed asset loading with retryable errors**

Add constants:

```javascript
const ATTACHMENT_DOCX_JS_BUNDLE = "docx_preview.bundle.js";
const ATTACHMENT_DOCX_CSS_BUNDLE = "docx_preview.bundle.css";
```

Add helper methods with these contracts:

```javascript
get_bundled_asset(path) {
	return frappe.assets?.bundled_asset?.(path) || frappe.boot?.assets_json?.[path] || path;
},
load_docx_asset({ tag, bundle, marker }) {
	const selector = `[data-attachment-docx="${marker}"]`;
	const wait_for_asset = (element) => {
		if (element.dataset.loaded === "1") return Promise.resolve(element);
		return new Promise((resolve, reject) => {
			const on_load = () => {
				element.dataset.loaded = "1";
				resolve(element);
			};
			const on_error = () => {
				element.remove();
				reject(new Error(`Unable to load ${bundle}`));
			};
			element.addEventListener("load", on_load, { once: true });
			element.addEventListener("error", on_error, { once: true });
		});
	};

	const existing = document.querySelector(selector);
	if (existing) return wait_for_asset(existing);

	const element = document.createElement(tag);
	element.dataset.attachmentDocx = marker;
	const asset_url = this.get_bundled_asset(bundle);
	const asset_promise = wait_for_asset(element);
	if (tag === "link") {
		element.rel = "stylesheet";
		element.href = asset_url;
		document.head.appendChild(element);
	} else {
		element.src = asset_url;
		element.async = true;
		document.body.appendChild(element);
	}
	return asset_promise;
},
ensure_docx_resources() {
	if (globalThis.frappeDocxPreview?.renderAsync) {
		return Promise.resolve(globalThis.frappeDocxPreview);
	}
	if (this.docx_resource_promise) return this.docx_resource_promise;
	this.docx_resource_promise = Promise.all([
		this.load_docx_asset({ tag: "link", bundle: ATTACHMENT_DOCX_CSS_BUNDLE, marker: "css" }),
		this.load_docx_asset({ tag: "script", bundle: ATTACHMENT_DOCX_JS_BUNDLE, marker: "js" }),
	])
		.then(() => {
			if (!globalThis.frappeDocxPreview?.renderAsync) throw new Error("DOCX renderer unavailable");
			return globalThis.frappeDocxPreview;
		})
		.catch((error) => {
			this.docx_resource_promise = null;
			throw error;
		});
	return this.docx_resource_promise;
},
```

Use real `load` and `error` listeners and remove a failed marked asset so retry can append a fresh element.

- [ ] **Step 4: Implement slide preparation and rendering**

Implement these single-purpose methods:

```javascript
fetch_file(url, options) {
	return fetch(url, options);
},
set_docx_state(root, state) {
	root.querySelector("[data-docx-loading]")?.classList.toggle("hidden", state !== "loading");
	root.querySelector("[data-docx-error]")?.classList.toggle("hidden", state !== "error");
	root.querySelector("[data-docx-content]")?.classList.toggle("hidden", state !== "rendered");
},
prepare_docx_slide(slide) {
	if (!slide?.docxUrl || !slide.el) return;
	const root = slide.el.querySelector("[data-docx-preview]");
	if (!root) return;
	root.querySelector("[data-docx-download]")?.setAttribute("href", slide.docxUrl);
	const retry = root.querySelector("[data-docx-retry]");
	if (retry && !retry.dataset.docxRetryBound) {
		retry.dataset.docxRetryBound = "1";
		retry.addEventListener("click", () => this.render_docx_slide(slide, { force: true }));
	}
	return this.render_docx_slide(slide);
},
```

`render_docx_slide()` must:

1. Skip `loading` and `rendered` states unless forced.
2. Set the loading state and clear old rendered content when forced.
3. Load renderer resources and fetch with `{ credentials: "same-origin" }`.
4. Throw for `!response.ok` before reading the body.
5. Call `renderAsync(arrayBuffer, content, styles, { breakPages: true, renderHeaders: true, renderFooters: true, useBase64URL: true })`.
6. Check `root.isConnected !== false` before touching final UI state.
7. Set `rendered` on success or `error` on failure and log the technical error with `console.error`.

Use this complete implementation:

```javascript
async render_docx_slide(slide, { force = false } = {}) {
	if (!slide?.docxUrl || !slide.el) return;
	if (!force && ["loading", "rendered"].includes(slide.docxRenderState)) return;

	const root = slide.el.querySelector("[data-docx-preview]");
	const content = root?.querySelector("[data-docx-content]");
	const styles = root?.querySelector("[data-docx-styles]");
	if (!root || !content || !styles) return;

	slide.docxRenderState = "loading";
	content.replaceChildren();
	styles.replaceChildren();
	this.set_docx_state(root, "loading");

	try {
		const [renderer, response] = await Promise.all([
			this.ensure_docx_resources(),
			this.fetch_file(slide.docxUrl, { credentials: "same-origin" }),
		]);
		if (!response.ok) throw new Error(`DOCX request failed with HTTP ${response.status}`);
		const buffer = await response.arrayBuffer();
		if (root.isConnected === false) return;
		await renderer.renderAsync(buffer, content, styles, {
			breakPages: true,
			renderHeaders: true,
			renderFooters: true,
			useBase64URL: true,
		});
		if (root.isConnected === false) return;
		slide.docxRenderState = "rendered";
		this.set_docx_state(root, "rendered");
	} catch (error) {
		slide.docxRenderState = "error";
		if (root.isConnected !== false) this.set_docx_state(root, "error");
		console.error("Unable to preview DOCX attachment", error);
	}
},
```

- [ ] **Step 5: Wire the Fancybox lifecycle**

Add to `Fancybox.show()` options:

```javascript
on: {
	"Carousel.attachSlideEl": (_fancybox, _carousel, slide) => {
		this.prepare_docx_slide(slide);
	},
},
```

The callback ignores image/video slides because they have no `docxUrl`.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js
node --test frappe/public/js/docx_preview.bundle.test.js
node --check frappe/public/js/frappe/form/controls/attach.js
git diff --check
```

Expected: all tests pass, syntax validation exits zero, and the diff has no whitespace errors.

- [ ] **Step 7: Commit the DOCX lifecycle**

```bash
git add frappe/public/js/frappe/form/controls/attach.js frappe/public/js/frappe/form/controls/attach.test.js
git commit -m "功能：在附件灯箱中渲染 DOCX"
```

### Task 4: Add The Responsive Document Reader Styles

**Files:**
- Modify: `frappe/public/js/frappe/form/controls/attach.test.js`
- Create: `frappe/public/scss/docx_preview.bundle.scss`

- [ ] **Step 1: Add a failing stylesheet contract test**

Read `frappe/public/scss/docx_preview.bundle.scss` from the Node test and assert it contains:

```javascript
const fs = require("node:fs");
const path = require("node:path");
const docx_styles = fs.readFileSync(
	path.resolve(__dirname, "../../../../scss/docx_preview.bundle.scss"),
	"utf8"
);

assert.match(docx_styles, /\.attachment-docx-preview/);
assert.match(docx_styles, /\.attachment-docx-toolbar/);
assert.match(docx_styles, /\.attachment-docx-viewport/);
assert.match(docx_styles, /\.attachment-docx-content/);
assert.match(docx_styles, /@media\s*\(max-width:\s*767px\)/);
assert.match(docx_styles, /100dvh/);
```

- [ ] **Step 2: Run the test and verify RED**

Run the focused attachment test. Expected: FAIL with `ENOENT` because the stylesheet does not exist.

- [ ] **Step 3: Implement the reader stylesheet**

Create the bundle with these layout rules:

```scss
.attachment-docx-preview {
	display: flex;
	flex-direction: column;
	width: min(1100px, 94vw);
	height: min(900px, 88vh);
	background: var(--bg-light-gray);
	color: var(--text-color);
}

.attachment-docx-toolbar {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	min-height: 48px;
	padding: 8px 12px;
	border-bottom: 1px solid var(--border-color);
	background: var(--fg-color);
}

.attachment-docx-viewport {
	position: relative;
	flex: 1 1 auto;
	min-height: 0;
	overflow: auto;
	padding: 24px;
}

.attachment-docx-status {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100%;
}

.attachment-docx-error-actions {
	display: inline-flex;
	margin-left: 8px;
}

.attachment-docx-content {
	min-width: min-content;
}

.attachment-docx-content .docx-wrapper {
	padding: 0;
	background: transparent;
}

.attachment-docx-content .docx {
	margin: 0 auto 24px;
	box-shadow: var(--shadow-md);
}

@media (max-width: 767px) {
	.attachment-docx-preview {
		width: 100vw;
		height: 100dvh;
	}

	.attachment-docx-viewport {
		padding: 12px;
	}
}
```

Use existing Desk variables and no decorative gradients, nested cards, or viewport-scaled text.

- [ ] **Step 4: Run tests and verify GREEN**

Run the attachment test and `git diff --check`. Expected: all tests pass with no whitespace errors.

- [ ] **Step 5: Commit the reader styles**

```bash
git add frappe/public/scss/docx_preview.bundle.scss frappe/public/js/frappe/form/controls/attach.test.js
git commit -m "样式：完善 DOCX 灯箱阅读器"
```

### Task 5: Build, Activate, And Verify On Sys

**Files:**
- Runtime assets: `sites/assets/frappe/dist/js/controls.bundle.*.js`, `sites/assets/frappe/dist/js/docx_preview.bundle.*.js`, and `sites/assets/frappe/dist/css/docx_preview.bundle.*.css`
- Update: `/www/haina/frappe-bench/task_plan.md`
- Update: `/www/haina/frappe-bench/findings.md`
- Update: `/www/haina/frappe-bench/progress.md`

- [ ] **Step 1: Run the complete focused verification**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js frappe/public/js/docx_preview.bundle.test.js
node --check frappe/public/js/frappe/form/controls/attach.js
git diff --check
```

Expected: all tests pass, syntax exits zero, and no whitespace errors are reported.

- [ ] **Step 2: Build production Frappe assets**

From `/www/haina/frappe-bench`:

```bash
bench build --app frappe --production
```

Expected: exit zero. `sites/assets/assets.json` maps all three logical bundles to hashed assets, and the DOCX parser is absent from the controls bundle but present in the dedicated DOCX bundle.

- [ ] **Step 3: Activate only the sys site runtime**

```bash
bench --site sys.autohaina.com clear-cache
bench restart
```

Expected: all Supervisor services return to RUNNING. Do not query, clear, or operate on `hn.autohaina.com`.

- [ ] **Step 4: Verify public runtime assets and health**

Require:

- `https://sys.autohaina.com/api/method/ping` returns HTTP 200.
- Each current hashed controls/DOCX JS/DOCX CSS asset returns HTTP 200.
- The built controls bundle recognizes `.docx`, references `docx_preview.bundle.js`, and wires the Fancybox slide callback.
- The dedicated DOCX bundle contains `docx-preview` rendering code.

- [ ] **Step 5: Verify the real file in a browser**

Open the purchase form containing `purchase_contract` URL `/files/251085.docx` with an authenticated sys session. Verify at desktop and mobile widths:

- Clicking the file opens Fancybox, not a new tab.
- Visible Word content renders and the canvas is not blank.
- Download opens the original file.
- Closing, reopening, and retry behavior work.
- An image and video attachment still use their existing viewers.
- No controls overlap the document or Fancybox navigation.

Capture screenshots and, when a browser automation session is available, assert the rendered document container has non-zero dimensions and non-empty child content.

- [ ] **Step 6: Record final evidence and inspect repository state**

Update the bench planning files with exact test counts, bundle hashes, health responses, browser results, and any baseline warnings. Run:

```bash
git status --short
git log -6 --oneline
```

Expected: only intentional implementation changes/commits are present; the unrelated Autohaina `gendan.json` change remains untouched.
