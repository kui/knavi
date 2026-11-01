import { describe, test } from "node:test";
import assert from "node:assert/strict";

(globalThis as Record<string, unknown>).document = { body: {} };

const { HinterContentRoot } = await import("../../src/content-root/hinter.js");

function makeView() {
  const rendered: unknown[] = [];
  let started = false;
  return {
    rendered,
    isStarted: () => started,
    start() {
      started = true;
    },
    render(targets: unknown[]) {
      rendered.push(...targets);
    },
    remove() {
      started = false;
    },
  };
}

function makeRectAggregator() {
  return {
    async *aggregate() {
      await Promise.resolve();
      yield [{ id: { frameId: 0, index: 0 }, rects: [], descriptions: {} }];
    },
    async action() {
      /* WHY: the stub has no frames to run the action in. */
    },
  };
}

void describe("HinterContentRoot.attachHints", () => {
  void test("waits for setup() instead of failing when settings load late", async () => {
    const view = makeView();
    const hinter = new HinterContentRoot(
      makeRectAggregator() as never,
      view as never,
    );

    const attached = hinter.attachHints();
    hinter.setup("asdf");
    await attached;

    assert.equal(view.rendered.length, 1);
  });

  void test("renders nothing when the session is removed before setup()", async () => {
    const view = makeView();
    const hinter = new HinterContentRoot(
      makeRectAggregator() as never,
      view as never,
    );

    const attached = hinter.attachHints();
    await hinter.removeHints(
      { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
      true,
    );
    hinter.setup("asdf");
    await attached;

    assert.equal(view.rendered.length, 0);
    assert.equal(view.isStarted(), false);
  });
});
