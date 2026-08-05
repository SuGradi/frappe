# Global Attach DOCX Direct Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.docx` links in every Frappe `Attach` control download directly while removing all DOCX lightbox rendering code and assets.

**Architecture:** Keep shared DOCX extension detection, but restrict Fancybox grouping to images and videos. Normalize rendered DOCX anchors once in `bind_attachment_lightbox()` so both single and multiple attachment layouts use native same-origin downloads. Remove the now-unused renderer dependency and bundles completely.

**Tech Stack:** Frappe v15 JavaScript, jQuery-backed controls, Fancybox 6.1.13 for image/video only, Node.js built-in test runner, Yarn 1, esbuild.

---

## File Structure

- Modify `frappe/public/js/frappe/form/controls/attach.js`: exclude DOCX from previews, normalize DOCX links for direct download, and remove the renderer lifecycle.
- Modify `frappe/public/js/frappe/form/controls/attach.test.js`: replace preview expectations with direct-download and image/video regression coverage.
- Delete `frappe/public/js/docx_preview.bundle.js`: remove the unused renderer entry point.
- Delete `frappe/public/js/docx_preview.bundle.test.js`: remove the obsolete renderer exposure test.
- Delete `frappe/public/scss/docx_preview.bundle.scss`: remove the obsolete reader styles.
- Modify `package.json`: remove `docx-preview`.
- Modify `yarn.lock`: remove `docx-preview` and transitive entries no longer required by another dependency.
- Update bench-root `task_plan.md`, `findings.md`, and `progress.md`: record implementation and rollout evidence without committing them to Frappe.

### Task 1: Route DOCX Links To Native Download

**Files:**
- Modify: `frappe/public/js/frappe/form/controls/attach.test.js`
- Modify: `frappe/public/js/frappe/form/controls/attach.js`

- [ ] **Step 1: Write the failing direct-download tests**

Change the URL contract to require DOCX detection but no Fancybox preview:

```javascript
assert.equal(helper.is_docx_url("/files/demo.docx"), true);
assert.equal(helper.is_previewable_url("/files/demo.docx"), false);
```

Change mixed gallery expectations so the DOCX item is absent while images and videos remain. Add this focused link-normalization test:

```javascript
test("attachment lightbox binding makes DOCX links download directly", () => {
	const helper = get_attachment_lightbox_helper();
	const links = [
		create_fake_link("/files/Contract%2025.DOCX", "_blank"),
		create_fake_link("/files/photo.jpg", "_blank"),
	];
	const container = create_fake_link_container(links);

	helper.prepare_direct_download_links(container);

	assert.equal(links[0].attributes.target, undefined);
	assert.equal(links[0].attributes.download, "Contract 25.DOCX");
	assert.equal(links[1].attributes.target, "_blank");
	assert.equal(links[1].attributes.download, undefined);
});
```

The fake link implements `getAttribute()`, `setAttribute()`, and `removeAttribute()`. The fake container implements `find(".attached-file-link").each(callback)` and passes each link to the callback.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js
```

Expected: FAIL because DOCX is still previewable and `prepare_direct_download_links()` does not exist.

- [ ] **Step 3: Implement native-download routing**

Keep `is_docx_url()`, but change the preview classifier:

```javascript
is_previewable_url(url) {
	return this.is_image_url(url) || this.is_video_url(url);
},
```

Add the shared normalizer:

```javascript
prepare_direct_download_links($container) {
	$container.find(".attached-file-link").each((_index, link) => {
		const href = link.getAttribute("href") || "";
		if (!this.is_docx_url(href)) return;

		link.removeAttribute("target");
		link.setAttribute("download", this.get_filename(href));
	});
},
```

Call `helper.prepare_direct_download_links($container);` at the start of `bind_attachment_lightbox()`. The delegated click handler already returns without `preventDefault()` for non-previewable URLs, so the browser performs the native download.

- [ ] **Step 4: Run tests and syntax checks**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js
node --check frappe/public/js/frappe/form/controls/attach.js
git diff --check
```

Expected: all attachment tests pass and both checks exit zero.

- [ ] **Step 5: Commit the behavior change**

```bash
git add frappe/public/js/frappe/form/controls/attach.js frappe/public/js/frappe/form/controls/attach.test.js
git commit -m "功能：DOCX 附件改为直接下载"
```

### Task 2: Remove The DOCX Preview Stack

**Files:**
- Modify: `frappe/public/js/frappe/form/controls/attach.js`
- Modify: `frappe/public/js/frappe/form/controls/attach.test.js`
- Delete: `frappe/public/js/docx_preview.bundle.js`
- Delete: `frappe/public/js/docx_preview.bundle.test.js`
- Delete: `frappe/public/scss/docx_preview.bundle.scss`
- Modify: `package.json`
- Modify: `yarn.lock`

- [ ] **Step 1: Remove preview-only helper code and tests**

Delete from `attach.js`:

- DOCX JS/CSS bundle constants.
- `get_docx_shell_html()` and the DOCX branch in `build_item()`.
- The `docxUrl` fallback in `get_item_url()`.
- Asset lookup/loading, DOCX resource loading, fetch, state, preparation, and render methods.
- The `Carousel.attachSlideEl` callback in `Fancybox.show()`.

Delete preview-only fake slide helpers and tests from `attach.test.js`. Keep extension detection, direct-download, image/video grouping, Fancybox start-index, bulk-delete, and media-style assertions that do not reference DOCX preview assets.

- [ ] **Step 2: Delete renderer files and remove the dependency**

Delete the three obsolete bundle files, then run:

```bash
COREPACK_ENABLE_PROJECT_SPEC=0 yarn remove docx-preview
```

Expected: `package.json` has no `docx-preview`, the lockfile has no direct entry, and no `packageManager` field is introduced.

- [ ] **Step 3: Verify no runtime preview references remain**

```bash
rg -n "docx_preview|docx-preview|frappeDocxPreview|attachment-docx|docxUrl" frappe package.json yarn.lock --glob '!**/node_modules/**'
```

Expected: no output. `is_docx_url`, direct-download tests, and the approved docs may still contain the word DOCX and are intentional.

- [ ] **Step 4: Run the focused verification**

```bash
node --test frappe/public/js/frappe/form/controls/attach.test.js
node --check frappe/public/js/frappe/form/controls/attach.js
git diff --check
```

Expected: all remaining tests pass and checks exit zero.

- [ ] **Step 5: Commit the cleanup**

```bash
git add package.json yarn.lock frappe/public/js/frappe/form/controls/attach.js frappe/public/js/frappe/form/controls/attach.test.js
git add -u frappe/public/js/docx_preview.bundle.js frappe/public/js/docx_preview.bundle.test.js frappe/public/scss/docx_preview.bundle.scss
git commit -m "清理：移除 DOCX 灯箱预览组件"
```

### Task 3: Integrate, Build, And Activate On Sys

**Files:**
- Runtime: `sites/assets/assets.json`
- Runtime: current `sites/assets/frappe/dist/js/controls.bundle.*.js`
- Update: `/www/haina/frappe-bench/task_plan.md`
- Update: `/www/haina/frappe-bench/findings.md`
- Update: `/www/haina/frappe-bench/progress.md`

- [ ] **Step 1: Verify and fast-forward the main checkout**

Run the focused tests in the feature worktree, then from the main Frappe checkout:

```bash
git merge --ff-only global-attach-docx-direct-download
```

Expected: the main checkout fast-forwards with no merge commit.

- [ ] **Step 2: Synchronize the main dependency tree and re-run tests**

```bash
COREPACK_ENABLE_PROJECT_SPEC=0 yarn install --frozen-lockfile
node --test frappe/public/js/frappe/form/controls/attach.test.js
node --check frappe/public/js/frappe/form/controls/attach.js
git diff --check
```

Expected: tests pass and the removed package no longer resolves from the main dependency tree.

- [ ] **Step 3: Build production assets**

From the bench root:

```bash
bench build --app frappe --production
```

Expected: build exits zero, `controls.bundle.js` maps to a hashed asset, and `assets.json` has no `docx_preview.bundle.js` or `docx_preview.bundle.css` entries.

- [ ] **Step 4: Activate sys and verify health**

```bash
bench --site sys.autohaina.com clear-cache
bench restart
supervisorctl status
curl -k -sS https://sys.autohaina.com/api/method/ping
```

Expected: all Supervisor processes are RUNNING and sys returns `{"message":"pong"}` with HTTP 200. Do not operate on `hn.autohaina.com`.

- [ ] **Step 5: Verify the production contract**

Require all of the following:

- The current controls asset returns HTTP 200.
- The built controls code recognizes `.docx`, removes `_blank`, writes the `download` filename, and does not contain DOCX renderer code.
- The manifest has no DOCX preview bundle mappings.
- `/files/251085.docx` remains HTTP 200 with the Word MIME type.
- Frappe and Autohaina repository states contain only intentional changes; the unrelated Autohaina `gendan.json` edit remains untouched.

- [ ] **Step 6: Record evidence and clean up the feature worktree**

Update the bench planning files with test count, build hash, health results, commit IDs, and the manual browser handoff. After final verification, delete the merged feature branch and worktree using the finishing-development-branch workflow.
