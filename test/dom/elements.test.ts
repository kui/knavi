import { describe, test } from "node:test";
import assert from "node:assert/strict";

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
class FakeNode {
  readonly parent: FakeNode | null;
  constructor(parent: FakeNode | null = null) {
    this.parent = parent;
  }
  contains(other: FakeNode | null): boolean {
    for (let n = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
  getRootNode(): FakeNode {
    return this.parent ? this.parent.getRootNode() : this;
  }
}
class FakeShadowRoot extends FakeNode {
  readonly host: FakeNode;
  constructor(host: FakeNode) {
    super();
    this.host = host;
  }
}
// WHY: patch globals before importing the module so instanceof checks work in Node.js.
(globalThis as Record<string, unknown>).HTMLInputElement = FakeInput;
(globalThis as Record<string, unknown>).HTMLTextAreaElement = FakeTextarea;
(globalThis as Record<string, unknown>).ShadowRoot = FakeShadowRoot;

const { containsComposed, isEditable } =
  await import("../../src/dom/elements.js");

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

  void describe("custom element with selectionStart", () => {
    function customEl(
      overrides: {
        disabled?: boolean;
        readOnly?: boolean;
        "aria-disabled"?: string;
        "aria-readonly"?: string;
      } = {},
    ): EventTarget {
      const attrs = new Map<string, string>();
      if (overrides["aria-disabled"])
        attrs.set("aria-disabled", overrides["aria-disabled"]);
      if (overrides["aria-readonly"])
        attrs.set("aria-readonly", overrides["aria-readonly"]);
      return {
        selectionStart: 0,
        disabled: overrides.disabled,
        readOnly: overrides.readOnly,
        getAttribute(name: string) {
          return attrs.get(name) ?? null;
        },
        /* eslint-disable @typescript-eslint/no-empty-function */
        addEventListener() {},
        dispatchEvent() {
          return true;
        },
        removeEventListener() {},
        /* eslint-enable @typescript-eslint/no-empty-function */
      } as unknown as EventTarget;
    }

    void test("custom element with selectionStart is editable", () =>
      assert.equal(isEditable(customEl()), true));

    void test("custom element with disabled=true is not editable", () =>
      assert.equal(isEditable(customEl({ disabled: true })), false));

    void test("custom element with readOnly=true is not editable", () =>
      assert.equal(isEditable(customEl({ readOnly: true })), false));

    void test('custom element with aria-disabled="true" is not editable', () =>
      assert.equal(isEditable(customEl({ "aria-disabled": "true" })), false));

    void test('custom element with aria-readonly="true" is not editable', () =>
      assert.equal(isEditable(customEl({ "aria-readonly": "true" })), false));
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

void describe("containsComposed", () => {
  const document = new FakeNode();
  const wrapper = new FakeNode(document);
  const host = new FakeNode(wrapper);
  const shadow = new FakeShadowRoot(host);
  const innerHost = new FakeNode(shadow);
  const innerShadow = new FakeShadowRoot(innerHost);
  const button = new FakeNode(innerShadow);
  const sibling = new FakeNode(document);
  const contains = (a: FakeNode, n: FakeNode | null) =>
    containsComposed(a as unknown as Node, n as unknown as Node | null);

  void test("contains a light-DOM descendant", () =>
    assert.equal(contains(wrapper, host), true));

  void test("contains itself", () => assert.equal(contains(host, host), true));

  void test("contains an element inside a descendant's shadow tree", () =>
    assert.equal(contains(wrapper, innerHost), true));

  void test("contains an element inside nested shadow trees", () =>
    assert.equal(contains(wrapper, button), true));

  void test("does not contain an unrelated element", () =>
    assert.equal(contains(sibling, button), false));

  void test("does not contain null", () =>
    assert.equal(contains(wrapper, null), false));
});
