const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.__ = (value) => value;
global.window = {
  location: {
    origin: "https://sys.autohaina.com",
  },
};
global.document = {
  querySelector() {
    return null;
  },
  createElement() {
    return {
      dataset: {},
    };
  },
  head: {
    appendChild() {},
  },
};
global.frappe = {
  provide(path) {
    const parts = path.split(".");
    let context = global;
    for (const part of parts) {
      context[part] = context[part] || {};
      context = context[part];
    }
  },
  ui: {
    form: {
      ControlData: class {},
    },
  },
  utils: {
    icon(name) {
      return `<svg data-icon="${name}"></svg>`;
    },
  },
};
global.$ = function () {
  return {
    removeClass() {
      return this;
    },
    addClass() {
      return this;
    },
    html() {
      return this;
    },
    off() {
      return this;
    },
    on() {
      return this;
    },
    appendTo() {
      return this;
    },
    prependTo() {
      return this;
    },
    toggle() {
      return this;
    },
  };
};

const { get_attachment_lightbox_helper } = require("./attach.js");

global.frappe.hide_progress = () => {};
global.frappe.show_progress = () => {};
global.frappe.show_alert = () => {};

function create_fake_node() {
  const classes = new Set(["hidden"]);
  const listeners = {};
  return {
    attributes: {},
    dataset: {},
    listeners,
    replace_count: 0,
    classList: {
      contains(name) {
        return classes.has(name);
      },
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener(name, callback) {
      listeners[name] = callback;
    },
    replaceChildren() {
      this.replace_count += 1;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function create_docx_slide(url = "/private/files/contract.docx") {
  const nodes = {
    loading: create_fake_node(),
    error: create_fake_node(),
    content: create_fake_node(),
    styles: create_fake_node(),
    download: create_fake_node(),
    retry: create_fake_node(),
  };
  const selectors = {
    "[data-docx-loading]": nodes.loading,
    "[data-docx-error]": nodes.error,
    "[data-docx-content]": nodes.content,
    "[data-docx-styles]": nodes.styles,
    "[data-docx-download]": nodes.download,
    "[data-docx-retry]": nodes.retry,
  };
  const root = {
    isConnected: true,
    querySelector(selector) {
      return selectors[selector] || null;
    },
  };
  const slide = {
    docxUrl: url,
    el: {
      querySelector(selector) {
        return selector === "[data-docx-preview]" ? root : null;
      },
    },
  };

  return { nodes, root, slide };
}

function create_fake_link(href, target) {
  const attributes = { href, target };
  return {
    attributes,
    getAttribute(name) {
      return attributes[name];
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    removeAttribute(name) {
      delete attributes[name];
    },
  };
}

function create_fake_link_container(links) {
  return {
    find(selector) {
      assert.equal(selector, ".attached-file-link");
      return {
        each(callback) {
          links.forEach((link, index) => callback(index, link));
        },
      };
    },
  };
}

test("attachment lightbox helper detects previewable image video and DOCX urls", () => {
  const helper = get_attachment_lightbox_helper();

  assert.equal(helper.is_image_url("/files/demo.jpg"), true);
  assert.equal(helper.is_image_url("https://sys.autohaina.com/files/demo.png?ver=1"), true);
  assert.equal(helper.is_image_url("/files/demo.pdf"), false);
  assert.equal(helper.is_image_url("/files/demo.mp4"), false);
  assert.equal(helper.is_video_url("/files/demo.mp4"), true);
  assert.equal(helper.is_video_url("/files/demo.webm?ver=1"), true);
  assert.equal(helper.is_video_url("/files/demo.pdf"), false);
  assert.equal(helper.is_docx_url("/files/demo.docx"), true);
  assert.equal(helper.is_docx_url("/files/DEMO.DOCX?version=2"), true);
  assert.equal(helper.is_docx_url("/files/demo.doc"), false);
  assert.equal(helper.is_docx_url("/files/demo.docx.exe"), false);
  assert.equal(helper.is_previewable_url("/files/demo.jpg"), true);
  assert.equal(helper.is_previewable_url("/files/demo.mp4"), true);
  assert.equal(helper.is_previewable_url("/files/demo.pdf"), false);
  assert.equal(helper.is_previewable_url("/files/demo.docx"), false);
  assert.equal(helper.get_video_format("/files/demo.ogv"), "video/ogg");
  assert.equal(helper.get_video_format("/files/demo.webm"), "video/webm");
  assert.equal(helper.get_video_format("/files/demo.mov"), "video/mp4");
});

test("attachment lightbox helper builds grouped media items from urls and attachments", () => {
  const helper = get_attachment_lightbox_helper();

  assert.deepEqual(helper.build_items_from_urls([
    "/files/a.jpg",
    "/files/b.docx",
    "/files/c.webp",
    "/files/d.mp4",
    "/files/e.webm",
    "/files/f.pdf",
  ]), [
    { src: "/files/a.jpg", type: "image", caption: "a.jpg" },
    { src: "/files/c.webp", type: "image", caption: "c.webp" },
    {
      src: "/files/d.mp4",
      type: "html5video",
      caption: "d.mp4",
      html5videoFormat: "video/mp4",
    },
    {
      src: "/files/e.webm",
      type: "html5video",
      caption: "e.webm",
      html5videoFormat: "video/webm",
    },
  ]);

  assert.deepEqual(helper.build_items_from_attachments([
    { file_url: "/files/a.jpg", file_name: "A 图" },
    { file_url: "/files/b.docx", file_name: "B 文档" },
    { file_url: "/files/c.mov", file_name: "C 视频" },
    { file_url: "/files/d.pdf", file_name: "D PDF" },
  ]), [
    { src: "/files/a.jpg", type: "image", caption: "A 图" },
    {
      src: "/files/c.mov",
      type: "html5video",
      caption: "C 视频",
      html5videoFormat: "video/mp4",
    },
  ]);
});

test("attachment lightbox start index ignores downloadable DOCX files", async () => {
  const helper = get_attachment_lightbox_helper();
  const items = helper.build_items_from_urls(["/files/a.jpg", "/files/b.docx", "/files/c.mp4"]);
  const original_ensure_resources = helper.ensure_resources;
  let shown_options = null;

  helper.ensure_resources = async () => ({
    show(_items, options) {
      shown_options = options;
    },
  });

  try {
    await helper.open(items, "/files/c.mp4");
  } finally {
    helper.ensure_resources = original_ensure_resources;
  }

  assert.equal(shown_options.startIndex, 1);
});

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

test("DOCX resources reuse an in-flight load and reset after a load error", async () => {
  const helper = get_attachment_lightbox_helper();
  const original_load_docx_asset = helper.load_docx_asset;
  const original_renderer = globalThis.frappeDocxPreview;
  let resolve_asset;
  let load_count = 0;
  const pending_asset = new Promise((resolve) => {
    resolve_asset = resolve;
  });

  delete globalThis.frappeDocxPreview;
  helper.docx_resource_promise = null;
  helper.load_docx_asset = () => {
    load_count += 1;
    return pending_asset;
  };

  try {
    const first = helper.ensure_docx_resources();
    const second = helper.ensure_docx_resources();
    assert.strictEqual(first, second);
    assert.equal(load_count, 2);

    globalThis.frappeDocxPreview = { renderAsync() {} };
    resolve_asset();
    assert.strictEqual(await first, globalThis.frappeDocxPreview);

    delete globalThis.frappeDocxPreview;
    helper.docx_resource_promise = null;
    helper.load_docx_asset = async () => {
      throw new Error("asset failed");
    };
    await assert.rejects(helper.ensure_docx_resources(), /asset failed/);
    assert.equal(helper.docx_resource_promise, null);
  } finally {
    helper.load_docx_asset = original_load_docx_asset;
    helper.docx_resource_promise = null;
    if (original_renderer) globalThis.frappeDocxPreview = original_renderer;
    else delete globalThis.frappeDocxPreview;
  }
});

test("DOCX slide fetches with the current session and renders only once", async () => {
  const helper = get_attachment_lightbox_helper();
  const original_fetch_file = helper.fetch_file;
  const original_ensure_docx_resources = helper.ensure_docx_resources;
  const { nodes, slide } = create_docx_slide();
  const calls = [];

  helper.fetch_file = async (url, options) => {
    calls.push([url, options]);
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  };
  helper.ensure_docx_resources = async () => ({
    renderAsync: async (buffer, content, styles, options) => {
      calls.push([buffer, content, styles, options]);
    },
  });

  try {
    await helper.render_docx_slide(slide);
    await helper.render_docx_slide(slide);
  } finally {
    helper.fetch_file = original_fetch_file;
    helper.ensure_docx_resources = original_ensure_docx_resources;
  }

  assert.deepEqual(calls[0], [
    "/private/files/contract.docx",
    { credentials: "same-origin" },
  ]);
  assert.equal(calls.length, 2);
  assert.equal(slide.docxRenderState, "rendered");
  assert.equal(nodes.content.replace_count, 1);
  assert.equal(nodes.content.classList.contains("hidden"), false);
});

test("DOCX slide exposes an error state and can retry after an HTTP failure", async () => {
  const helper = get_attachment_lightbox_helper();
  const original_fetch_file = helper.fetch_file;
  const original_ensure_docx_resources = helper.ensure_docx_resources;
  const original_console_error = console.error;
  const { nodes, slide } = create_docx_slide();
  let fetch_count = 0;
  let render_count = 0;

  helper.fetch_file = async () => {
    fetch_count += 1;
    if (fetch_count === 1) return { ok: false, status: 403 };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  helper.ensure_docx_resources = async () => ({
    renderAsync: async () => {
      render_count += 1;
    },
  });
  console.error = () => {};

  try {
    await helper.render_docx_slide(slide);
    assert.equal(slide.docxRenderState, "error");
    assert.equal(nodes.error.classList.contains("hidden"), false);
    assert.equal(render_count, 0);

    await helper.render_docx_slide(slide, { force: true });
  } finally {
    helper.fetch_file = original_fetch_file;
    helper.ensure_docx_resources = original_ensure_docx_resources;
    console.error = original_console_error;
  }

  assert.equal(fetch_count, 2);
  assert.equal(render_count, 1);
  assert.equal(slide.docxRenderState, "rendered");
});

test("DOCX slide preparation binds download and retry actions", async () => {
  const helper = get_attachment_lightbox_helper();
  const original_render_docx_slide = helper.render_docx_slide;
  const { nodes, slide } = create_docx_slide("/files/demo.docx");
  const calls = [];
  const shell = helper.get_docx_shell_html();

  helper.render_docx_slide = async (_slide, options) => {
    calls.push(options || {});
  };

  try {
    await helper.prepare_docx_slide(slide);
    await nodes.retry.listeners.click();
  } finally {
    helper.render_docx_slide = original_render_docx_slide;
  }

  assert.equal(nodes.download.attributes.href, "/files/demo.docx");
  assert.equal(nodes.download.attributes.download, "demo.docx");
  assert.match(shell, /data-docx-download download/);
  assert.doesNotMatch(shell, /data-docx-download[^>]*target="_blank"/);
  assert.equal(nodes.retry.dataset.docxRetryBound, "1");
  assert.deepEqual(calls, [{}, { force: true }]);
});

test("Fancybox attachment callback prepares DOCX slides only", async () => {
  const helper = get_attachment_lightbox_helper();
  const original_ensure_resources = helper.ensure_resources;
  const original_prepare_docx_slide = helper.prepare_docx_slide;
  const prepared = [];
  let shown_options = null;

  helper.ensure_resources = async () => ({
    show(_items, options) {
      shown_options = options;
    },
  });
  helper.prepare_docx_slide = (slide) => {
    prepared.push(slide);
  };

  try {
    await helper.open(helper.build_items_from_urls(["/files/a.jpg", "/files/b.docx"]), "/files/b.docx");
    const attach_slide = shown_options.on["Carousel.attachSlideEl"];
    const docx_slide = { docxUrl: "/files/b.docx" };
    attach_slide(null, null, docx_slide);
    attach_slide(null, null, { src: "/files/a.jpg" });
    assert.deepEqual(prepared, [docx_slide]);
  } finally {
    helper.ensure_resources = original_ensure_resources;
    helper.prepare_docx_slide = original_prepare_docx_slide;
  }
});

test("DOCX preview stylesheet provides stable desktop and mobile reader dimensions", () => {
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
});

test("bulk delete removes selected stale urls from multi-attach field", async () => {
  const control = Object.create(frappe.ui.form.ControlAttach.prototype);
  const stale_url = "/files/missing-from-current-attachments.jpg";
  const kept_url = "/files/keep.jpg";
  let next_urls = null;
  let failures = null;

  control.value = JSON.stringify([stale_url, kept_url]);
  control.selected_files = new Set([stale_url]);
  control.is_bulk_delete_mode = true;
  control.frm = null;
  control.get_files_from_value = frappe.ui.form.ControlAttach.prototype.get_files_from_value;
  control.update_field_value_and_save = async (urls) => {
    next_urls = urls;
  };
  control.show_bulk_delete_failures = (rows) => {
    failures = rows;
  };
  control.render_files = () => {};
  control.get_file_name_from_url = frappe.ui.form.ControlAttach.prototype.get_file_name_from_url;

  await control.on_bulk_delete_complete(
    { message: { deleted: [], failed: [] } },
    [],
    [stale_url],
    "Deleting"
  );

  assert.deepEqual(next_urls, [kept_url]);
  assert.equal(control.selected_files.size, 0);
  assert.equal(control.is_bulk_delete_mode, false);
  assert.equal(failures, null);
});

test("bulk delete select all toggles every file in multi-attach field", () => {
  const control = Object.create(frappe.ui.form.ControlAttach.prototype);
  const file_urls = ["/files/a.jpg", "/files/b.jpg", "/files/c.jpg"];
  let render_count = 0;

  control.value = JSON.stringify(file_urls);
  control.selected_files = new Set();
  control.get_files_from_value = frappe.ui.form.ControlAttach.prototype.get_files_from_value;
  control.render_files = () => {
    render_count += 1;
  };

  control.toggle_all_file_selection();

  assert.deepEqual(control.get_selected_files(), file_urls);

  control.toggle_all_file_selection();

  assert.deepEqual(control.get_selected_files(), []);
  assert.equal(render_count, 2);
});
