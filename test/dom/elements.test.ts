import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Patch globals before importing the module so instanceof checks work in Node.js.
/* eslint-disable @typescript-eslint/no-empty-function */
class FakeInput implements EventTarget {
  type = "text";
  disabled = false;
  readOnly = false;
  addEventListener() {}
  dispatchEvent() {
    return true;
  }
  removeEventListener() {}
}
class FakeTextarea implements EventTarget {
  disabled = false;
  readOnly = false;
  addEventListener() {}
  dispatchEvent() {
    return true;
  }
  removeEventListener() {}
}
/* eslint-enable @typescript-eslint/no-empty-function */
(globalThis as Record<string, unknown>).HTMLInputElement = FakeInput;
(globalThis as Record<string, unknown>).HTMLTextAreaElement = FakeTextarea;

// Import after patching globals.
const { isEditable } = await import("../../src/dom/elements.js");

function input(overrides: Partial<FakeInput> = {}): EventTarget {
  return Object.assign(new FakeInput(), overrides);
}
function textarea(overrides: Partial<FakeTextarea> = {}): EventTarget {
  return Object.assign(new FakeTextarea(), overrides);
}

void describe("isEditable", () => {
  void describe("HTMLInputElement", () => {
    void test("text input is editable", () =>
      assert.equal(isEditable(input({ type: "text" })), true));

    void test("email input is editable", () =>
      assert.equal(isEditable(input({ type: "email" })), true));

    void test("number input is editable", () =>
      assert.equal(isEditable(input({ type: "number" })), true));

    void test("date input is editable", () =>
      assert.equal(isEditable(input({ type: "date" })), true));

    void test("search input is editable", () =>
      assert.equal(isEditable(input({ type: "search" })), true));

    void test("disabled input is not editable", () =>
      assert.equal(isEditable(input({ disabled: true })), false));

    void test("readonly input is not editable", () =>
      assert.equal(isEditable(input({ readOnly: true })), false));

    void test("checkbox is not editable", () =>
      assert.equal(isEditable(input({ type: "checkbox" })), false));

    void test("radio is not editable", () =>
      assert.equal(isEditable(input({ type: "radio" })), false));

    void test("hidden is not editable", () =>
      assert.equal(isEditable(input({ type: "hidden" })), false));

    void test("file is not editable", () =>
      assert.equal(isEditable(input({ type: "file" })), false));

    void test("range is not editable", () =>
      assert.equal(isEditable(input({ type: "range" })), false));

    void test("color is not editable", () =>
      assert.equal(isEditable(input({ type: "color" })), false));

    void test("button is not editable", () =>
      assert.equal(isEditable(input({ type: "button" })), false));

    void test("submit is not editable", () =>
      assert.equal(isEditable(input({ type: "submit" })), false));
  });

  void describe("HTMLTextAreaElement", () => {
    void test("textarea is editable", () =>
      assert.equal(isEditable(textarea()), true));

    void test("disabled textarea is not editable", () =>
      assert.equal(isEditable(textarea({ disabled: true })), false));

    void test("readonly textarea is not editable", () =>
      assert.equal(isEditable(textarea({ readOnly: true })), false));
  });

  void describe("contenteditable", () => {
    void test("contenteditable element is editable", () =>
      assert.equal(
        isEditable({ isContentEditable: true } as unknown as EventTarget),
        true,
      ));

    void test("non-contenteditable element is not editable", () =>
      assert.equal(
        isEditable({ isContentEditable: false } as unknown as EventTarget),
        false,
      ));
  });
});
