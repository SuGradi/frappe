const test = require("node:test");
const assert = require("node:assert/strict");

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
