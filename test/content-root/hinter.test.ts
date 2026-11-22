import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// WHY: HinterContentRoot and RectAggregatorClient run in the root frame only, so parent === window here.
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).parent = globalThis;
(globalThis as Record<string, unknown>).document = {
  body: {},
  documentElement: { clientWidth: 800, clientHeight: 600 },
};
const sentTypes: string[] = [];
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: (msg: { "@type": string }) => {
      sentTypes.push(msg["@type"]);
      return Promise.resolve({ response: undefined });
    },
  },
};

import type { SingleLetter } from "../../src/lib/strings.js";

const { HinterContentRoot } = await import("../../src/content-root/hinter.js");
const { RectAggregatorClient } =
  await import("../../src/content-root/rect-aggregator-client.js");

/** Mirrors HintView's preconditions: start() once, render()/remove() only after it. */
function makeView() {
  let started = false;
  let rendered = 0;
  const batches: HintedElement[][] = [];
  const hits: HintedElement[][] = [];
  const badges: unknown[] = [];
  let cycleSet: HintedElement[] | null = null;
  return {
    get rendered() {
      return rendered;
    },
    batches,
    hits,
    badges,
    setCycleSet(set: HintedElement[]) {
      cycleSet = set;
    },
    computeCycleSet: (hit: HintedElement) => cycleSet ?? [hit],
    hit(changes: HintedElement[], _descriptions: unknown, badge: unknown) {
      if (!started) throw Error("Illegal state");
      hits.push([...changes]);
      badges.push(badge);
    },
    isStarted: () => started,
    start() {
      if (started) throw Error("Illegal state");
      started = true;
    },
    render(targets: unknown[]) {
      if (!started) throw Error("Illegal state");
      rendered += targets.length;
      batches.push(targets as HintedElement[]);
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
    const id = await hinter.attachHints();
    await tick();
    aggregator.handleRects(++requestId, RECTS);
    await tick();
    await hinter.removeHints(id, OPTIONS, false);
  }

  void test("attachHints waits for setup() instead of failing when settings load late", async () => {
    const attached = hinter.attachHints();
    await tick();
    hinter.setup("asdf");
    const id = await attached;
    await tick();
    aggregator.handleRects(++requestId, RECTS);
    await tick();

    assert.equal(view.rendered, 1);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("attachHints resolves with the session id before any rects arrive", async () => {
    hinter.setup("asdf");
    const first = await hinter.attachHints();
    assert.equal(view.rendered, 0);
    await hinter.removeHints(first, OPTIONS, false);
    const second = await hinter.attachHints();
    assert.ok(second > first);
    await hinter.removeHints(second, OPTIONS, false);
  });

  void test("a second attachHints while a session is live rejects", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await assert.rejects(hinter.attachHints(), /already started/);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("messages with the id of an ended session are ignored", async () => {
    hinter.setup("asdf");
    const old = await hinter.attachHints();
    await hinter.removeHints(old, OPTIONS, false);
    const id = await hinter.attachHints();
    await tick();
    // WHY: each session's aggregate() takes the next request id.
    requestId += 2;
    aggregator.handleRects(requestId, RECTS);
    await tick();

    hinter.hitHint(old, "a" as SingleLetter);
    hinter.cycleHint(old);
    await hinter.removeHints(old, OPTIONS, true);
    assert.equal(view.hits.length, 0);
    assert.equal(view.isStarted(), true);

    await hinter.removeHints(id, OPTIONS, false);
    assert.equal(view.isStarted(), false);
  });

  void test("a rendering failure keeps the session live until RemoveHints", async () => {
    hinter.setup("asdf");
    const failing = {
      // eslint-disable-next-line @typescript-eslint/require-await, require-yield
      async *aggregate() {
        throw Error("aggregation failed");
      },
      action: () => Promise.resolve(),
    };
    const root = new HinterContentRoot(failing as never, view as never);
    root.setup("asdf");
    const id = await root.attachHints();
    await tick();
    await assert.rejects(root.attachHints(), /already started/);
    await root.removeHints(id, OPTIONS, false);
    await root.removeHints(await root.attachHints(), OPTIONS, false);
  });

  void test("releasing before the first rects renders nothing and keeps hinting usable", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await hinter.removeHints(id, OPTIONS, true);
    aggregator.handleRects(++requestId, RECTS);
    await tick();

    assert.equal(view.rendered, 0);
    assert.equal(view.isStarted(), false);
    await attachAndRender();
    assert.equal(view.rendered, 1);
  });

  void test("letters typed before the first rects are applied to the first batch", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await tick();

    assert.doesNotThrow(() => hinter.hitHint(id, "a" as SingleLetter));
    assert.equal(view.hits.length, 0);

    aggregator.handleRects(requestId + 1, RECTS);
    await tick();

    assert.equal(view.batches[0][0].state, "hit");
    assert.equal(view.hits.length, 1);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("letters typed before the first rects are applied to later batches too", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await tick();
    hinter.hitHint(id, "s" as SingleLetter);

    // WHY: the first batch holds hint "a", the second hint "s".
    aggregator.handleRects(requestId + 1, RECTS);
    await tick();
    assert.equal(view.batches[0][0].state, "disabled");
    aggregator.handleRects(requestId + 1, RECTS);
    await tick();

    assert.equal(view.batches[1][0].state, "hit");
    assert.equal(view.hits.length, 1);
    assert.ok(view.hits[0].includes(view.batches[1][0]));
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("later batches without a hit do not call view.hit again", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await tick();
    hinter.hitHint(id, "a" as SingleLetter);

    aggregator.handleRects(requestId + 1, RECTS);
    await tick();
    assert.equal(view.hits.length, 1);
    aggregator.handleRects(requestId + 1, RECTS);
    await tick();

    assert.equal(view.hits.length, 1);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("a later batch does not call view.hit after the Cycle Key", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await tick();
    hinter.hitHint(id, "a" as SingleLetter);
    aggregator.handleRects(requestId + 1, RECTS);
    await tick();
    const a = view.batches[0][0];
    const b = { ...a, hint: "zz", state: "candidate" } as HintedElement;
    view.setCycleSet([a, b]);
    hinter.cycleHint(id);
    const badge = view.badges.at(-1);
    assert.deepEqual(badge, { count: 1, index: 2, total: 2 });
    const calls = view.hits.length;

    view.setCycleSet([a, b, { ...a }, { ...a }] as HintedElement[]);
    aggregator.handleRects(requestId + 1, RECTS);
    await tick();

    assert.equal(view.hits.length, calls);
    assert.deepEqual(view.badges.at(-1), badge);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("letters typed after an empty first batch are applied to the next batch", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await tick();
    aggregator.handleRects(requestId + 1, []);
    await tick();
    assert.equal(view.isStarted(), true);

    hinter.hitHint(id, "a" as SingleLetter);
    assert.equal(view.hits.length, 1);
    aggregator.handleRects(requestId + 1, RECTS);
    await tick();

    assert.equal(view.batches[0][0].state, "hit");
    assert.equal(view.hits.length, 2);
    assert.ok(view.hits[1].includes(view.batches[0][0]));
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("a Cycle Key and an Action Key before the first rects call neither view.hit nor an action", async () => {
    hinter.setup("asdf");
    const id = await hinter.attachHints();
    await tick();
    sentTypes.length = 0;

    hinter.cycleHint(id);
    await hinter.removeHints(id, OPTIONS, true);

    assert.equal(view.hits.length, 0);
    assert.ok(!sentTypes.includes("ExecuteAction"));
  });
});
