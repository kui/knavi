import { describe, test } from "node:test";
import assert from "node:assert/strict";

// BlurerContentRoot is loaded in the root frame only.
(globalThis as Record<string, unknown>).parent = globalThis;
(globalThis as Record<string, unknown>).window = globalThis;

const { BlurerContentRoot } = await import("../../src/content-root/blurer.js");

interface BlurViewLike {
  blur: (rect: unknown) => void;
}

function makeView(): BlurViewLike & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    blur(rect: unknown) {
      calls.push(rect);
    },
  };
}

function makeActiveElement(blurred: { count: number }) {
  return {
    blur() {
      blurred.count++;
    },
  };
}

void describe("BlurerContentRoot.handleBlurRoot", () => {
  void test("calls activeElement.blur() and runs animation when rect is provided", () => {
    const view = makeView();
    const blurred = { count: 0 };

    (globalThis as Record<string, unknown>).document = {
      activeElement: makeActiveElement(blurred),
    };

    const blurer = new BlurerContentRoot(view as never);
    blurer.handleBlurRoot({
      type: "element-border",
      origin: "layout-viewport",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });

    assert.equal(blurred.count, 1, "blur() should be called");
    assert.equal(
      view.calls.length,
      1,
      "view.blur() should be called with rect",
    );
  });

  void test("calls activeElement.blur() but skips animation when rect is null", () => {
    const view = makeView();
    const blurred = { count: 0 };

    (globalThis as Record<string, unknown>).document = {
      activeElement: makeActiveElement(blurred),
    };

    const blurer = new BlurerContentRoot(view as never);
    blurer.handleBlurRoot(null);

    assert.equal(blurred.count, 1, "blur() must be called even with null rect");
    assert.equal(
      view.calls.length,
      0,
      "view.blur() must NOT be called when rect is null",
    );
  });

  void test("no-ops when document.activeElement is null", () => {
    const view = makeView();

    (globalThis as Record<string, unknown>).document = {
      activeElement: null,
    };

    const blurer = new BlurerContentRoot(view as never);
    blurer.handleBlurRoot(null);

    assert.equal(view.calls.length, 0);
  });
});
