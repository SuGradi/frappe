const test = require("node:test");
const assert = require("node:assert/strict");

test("local DOCX bundle exposes the docx-preview renderer", () => {
	delete globalThis.frappeDocxPreview;
	delete require.cache[require.resolve("./docx_preview.bundle.js")];
	require("./docx_preview.bundle.js");

	assert.equal(typeof globalThis.frappeDocxPreview?.renderAsync, "function");
});
