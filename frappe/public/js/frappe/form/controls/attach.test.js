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

test("attachment lightbox helper detects image urls and ignores non-images", () => {
  const helper = get_attachment_lightbox_helper();

  assert.equal(helper.is_image_url("/files/demo.jpg"), true);
  assert.equal(helper.is_image_url("https://sys.autohaina.com/files/demo.png?ver=1"), true);
  assert.equal(helper.is_image_url("/files/demo.pdf"), false);
  assert.equal(helper.is_image_url("/files/demo.mp4"), false);
});

test("attachment lightbox helper builds grouped image items from urls and attachments", () => {
  const helper = get_attachment_lightbox_helper();

  assert.deepEqual(helper.build_items_from_urls([
    "/files/a.jpg",
    "/files/b.pdf",
    "/files/c.webp",
  ]), [
    { src: "/files/a.jpg", type: "image", caption: "a.jpg" },
    { src: "/files/c.webp", type: "image", caption: "c.webp" },
  ]);

  assert.deepEqual(helper.build_items_from_attachments([
    { file_url: "/files/a.jpg", file_name: "A 图" },
    { file_url: "/files/b.pdf", file_name: "B 文档" },
  ]), [
    { src: "/files/a.jpg", type: "image", caption: "A 图" },
  ]);
});
