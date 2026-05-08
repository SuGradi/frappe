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

test("attachment lightbox helper detects previewable image and video urls", () => {
  const helper = get_attachment_lightbox_helper();

  assert.equal(helper.is_image_url("/files/demo.jpg"), true);
  assert.equal(helper.is_image_url("https://sys.autohaina.com/files/demo.png?ver=1"), true);
  assert.equal(helper.is_image_url("/files/demo.pdf"), false);
  assert.equal(helper.is_image_url("/files/demo.mp4"), false);
  assert.equal(helper.is_video_url("/files/demo.mp4"), true);
  assert.equal(helper.is_video_url("/files/demo.webm?ver=1"), true);
  assert.equal(helper.is_video_url("/files/demo.pdf"), false);
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
