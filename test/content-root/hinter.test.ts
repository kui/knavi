import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// WHY: HinterContentRoot and RectAggregatorClient run in the root frame only, so parent === window here.
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).parent = globalThis;
(globalThis as Record<string, unknown>).document = {
  body: {},
  documentElement: { clientWidth: 800, clientHeight: 600 },
};
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: () => Promise.resolve({ response: undefined }),
  },
};

const { HinterContentRoot } = await import("../../src/content-root/hinter.js");
const { RectAggregatorClient } =
  await import("../../src/content-root/rect-aggregator-client.js");

/** Mirrors HintView's preconditions: start() once, render()/remove() only after it. */
function makeView() {
  let started = false;
  let rendered = 0;
  return {
    get rendered() {
      return rendered;
    },
    isStarted: () => started,
    start() {
      if (started) throw Error("Illegal state");
      started = true;
    },
    render(targets: unknown[]) {
      if (!started) throw Error("Illegal state");
      rendered += targets.length;
    },
    remove() {
      if (!started) throw Error("Illegal state");
      started = false;
    },
  };
}

const OPTIONS = {
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};
const RECTS = [
  { id: { frameId: 0, index: 0 }, rects: [], descriptions: {} },
] as unknown as ElementRects[];

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

void describe("HinterContentRoot", () => {
  let view: ReturnType<typeof makeView>;
  let aggregator: InstanceType<typeof RectAggregatorClient>;
  let hinter: InstanceType<typeof HinterContentRoot>;
  let requestId: number;

  beforeEach(() => {
    view = makeView();
    aggregator = new RectAggregatorClient();
    hinter = new HinterContentRoot(aggregator, view as never);
    requestId = 0;
  });

  async function attachAndRender() {
    const attached = hinter.attachHints();
    await tick();
    aggregator.handleRects(++requestId, RECTS);
    await tick();
    await hinter.removeHints(OPTIONS, false);
    await attached;
  }

  void test("attachHints waits for setup() instead of failing when settings load late", async () => {
    const attached = hinter.attachHints();
    await tick();
    hinter.setup("asdf");
    await tick();
    aggregator.handleRects(++requestId, RECTS);
    await tick();

    assert.equal(view.rendered, 1);
    await hinter.removeHints(OPTIONS, false);
    await attached;
  });

  void test("releasing before setup() renders nothing and keeps hinting usable", async () => {
    const attached = hinter.attachHints();
    await tick();
    await hinter.removeHints(OPTIONS, true);
    hinter.setup("asdf");
    await attached;

    assert.equal(view.rendered, 0);
    assert.equal(view.isStarted(), false);
    await attachAndRender();
    assert.equal(view.rendered, 1);
  });

  void test("releasing before the first rects renders nothing and keeps hinting usable", async () => {
    hinter.setup("asdf");
    const attached = hinter.attachHints();
    await tick();
    await hinter.removeHints(OPTIONS, true);
    aggregator.handleRects(++requestId, RECTS);
    await attached;

    assert.equal(view.rendered, 0);
    assert.equal(view.isStarted(), false);
    await attachAndRender();
    assert.equal(view.rendered, 1);
  });
});
