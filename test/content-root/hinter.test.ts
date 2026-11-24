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

  beforeEach(() => {
    view = makeView();
    aggregator = new RectAggregatorClient();
    hinter = new HinterContentRoot(aggregator, view as never);
  });

  async function attachAndRender() {
    const id = hinter.attachHints();
    await tick();
    aggregator.handleRects(id, RECTS);
    await tick();
    await hinter.removeHints(id, OPTIONS, false);
  }

  void test("attachHints waits for setup() instead of failing when settings load late", async () => {
    const id = hinter.attachHints();
    await tick();
    hinter.setup("asdf");
    await tick();
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.rendered, 1);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("attachHints returns the session id before any rects arrive", async () => {
    hinter.setup("asdf");
    const first = hinter.attachHints();
    assert.equal(view.rendered, 0);
    await hinter.removeHints(first, OPTIONS, false);
    const second = hinter.attachHints();
    assert.ok(second > first);
    await hinter.removeHints(second, OPTIONS, false);
  });

  void test("removeHints before setup() ends the session without waiting for it", async () => {
    const id = hinter.attachHints();
    await hinter.removeHints(id, OPTIONS, true);
    const next = hinter.attachHints();
    assert.ok(next > id);
    hinter.setup("asdf");
    await tick();
    aggregator.handleRects(next, RECTS);
    await tick();
    assert.equal(view.rendered, 1);
    await hinter.removeHints(next, OPTIONS, false);
  });

  void test("a new content-root's ids exceed an older one's", async (t) => {
    const now = t.mock.method(Date, "now", () => 1000);
    const old = new HinterContentRoot(aggregator, view as never);
    old.setup("asdf");
    let last = 0;
    for (let i = 0; i < 3; i++) {
      last = old.attachHints();
      await old.removeHints(last, OPTIONS, false);
    }
    // WHY: a new top document loads at least a moment after the old one's sessions.
    now.mock.mockImplementation(() => 2000);
    const next = new HinterContentRoot(aggregator, view as never);
    next.setup("asdf");
    assert.ok(next.attachHints() > last);
  });

  void test("a content-root restored after another document's sessions issues larger ids", async (t) => {
    const now = t.mock.method(Date, "now", () => 1000);
    const restored = new HinterContentRoot(aggregator, view as never);
    restored.setup("asdf");
    now.mock.mockImplementation(() => 2000);
    const other = new HinterContentRoot(aggregator, view as never);
    other.setup("asdf");
    const otherId = other.attachHints();
    await other.removeHints(otherId, OPTIONS, false);

    now.mock.mockImplementation(() => 3000);
    assert.ok(restored.attachHints() > otherId);
  });

  void test("letters typed before setup() are applied once the hint letters are known", async () => {
    const id = hinter.attachHints();
    hinter.hitHint(id, "z" as SingleLetter);
    hinter.hitHint(id, "a" as SingleLetter);
    hinter.setup("asdf");
    await tick();
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.batches[0][0].state, "hit");
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("attachHints rejects an empty hint letter setting once it is loaded", () => {
    hinter.setup("");
    assert.throws(() => hinter.attachHints(), /hintLetters is empty/);
    hinter.setup("asdf");
    assert.doesNotThrow(() => hinter.attachHints());
  });

  void test("an empty hint letter setting loaded after attach leaves the session for RemoveHints", async () => {
    const id = hinter.attachHints();
    sentTypes.length = 0;
    hinter.setup("");
    await tick();
    assert.ok(!sentTypes.includes("AllRectsRequest"));
    aggregator.handleRects(id, RECTS);
    await tick();
    assert.equal(view.rendered, 0);
    assert.equal(view.isStarted(), false);
    assert.throws(() => hinter.attachHints(), /already started/);
    await hinter.removeHints(id, OPTIONS, false);
    hinter.setup("asdf");
    assert.doesNotThrow(() => hinter.attachHints());
  });

  void test("a session ended before setup() does not wait for document.body", async () => {
    const doc = globalThis.document as unknown as { body: unknown };
    const body = doc.body;
    let frames = 0;
    (globalThis as Record<string, unknown>).requestAnimationFrame = (
      cb: (t: number) => void,
    ) => {
      frames++;
      return setTimeout(() => cb(0), 0);
    };
    doc.body = null;
    try {
      const id = hinter.attachHints();
      await hinter.removeHints(id, OPTIONS, false);
      hinter.setup("asdf");
      await tick();
      await tick();
      assert.equal(frames, 0);
    } finally {
      doc.body = body;
      await tick();
      Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    }
  });

  void test("a session ended while waiting for document.body renders nothing", async () => {
    const doc = globalThis.document as unknown as { body: unknown };
    const body = doc.body;
    (globalThis as Record<string, unknown>).requestAnimationFrame = (
      cb: (t: number) => void,
    ) => setTimeout(() => cb(0), 0);
    doc.body = null;
    try {
      hinter.setup("asdf");
      const id = hinter.attachHints();
      await tick();
      await hinter.removeHints(id, OPTIONS, false);
      sentTypes.length = 0;
      doc.body = body;
      await tick();
      await tick();
      // WHY: starting the aggregation would leave it waiting for rects of an ended session.
      assert.ok(!sentTypes.includes("AllRectsRequest"));
      aggregator.handleRects(id, RECTS);
      await tick();
      assert.equal(view.rendered, 0);
      assert.equal(view.isStarted(), false);
    } finally {
      doc.body = body;
      Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    }
  });

  void test("a second attachHints while a session is live rejects", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    assert.throws(() => hinter.attachHints(), /already started/);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("messages with the id of an ended session are ignored", async () => {
    hinter.setup("asdf");
    const old = hinter.attachHints();
    await tick();
    await hinter.removeHints(old, OPTIONS, false);
    const id = hinter.attachHints();
    await tick();
    aggregator.handleRects(id, RECTS);
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
    const id = root.attachHints();
    await tick();
    assert.throws(() => root.attachHints(), /already started/);
    await root.removeHints(id, OPTIONS, false);
    await root.removeHints(root.attachHints(), OPTIONS, false);
  });

  void test("releasing before the first rects renders nothing and keeps hinting usable", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    await hinter.removeHints(id, OPTIONS, true);
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.rendered, 0);
    assert.equal(view.isStarted(), false);
    await attachAndRender();
    assert.equal(view.rendered, 1);
  });

  void test("letters typed before the first rects are applied to the first batch", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();

    assert.doesNotThrow(() => hinter.hitHint(id, "a" as SingleLetter));
    assert.equal(view.hits.length, 0);

    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.batches[0][0].state, "hit");
    assert.equal(view.hits.length, 1);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("letters typed before the first rects are applied to later batches too", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    hinter.hitHint(id, "s" as SingleLetter);

    // WHY: the first batch holds hint "a", the second hint "s".
    aggregator.handleRects(id, RECTS);
    await tick();
    assert.equal(view.batches[0][0].state, "disabled");
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.batches[1][0].state, "hit");
    assert.equal(view.hits.length, 1);
    assert.ok(view.hits[0].includes(view.batches[1][0]));
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("later batches without a hit do not call view.hit again", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    hinter.hitHint(id, "a" as SingleLetter);

    aggregator.handleRects(id, RECTS);
    await tick();
    assert.equal(view.hits.length, 1);
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.hits.length, 1);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("a later batch does not call view.hit after the Cycle Key", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    hinter.hitHint(id, "a" as SingleLetter);
    aggregator.handleRects(id, RECTS);
    await tick();
    const a = view.batches[0][0];
    const b = { ...a, hint: "zz", state: "candidate" } as HintedElement;
    view.setCycleSet([a, b]);
    hinter.cycleHint(id);
    const badge = view.badges.at(-1);
    assert.deepEqual(badge, { count: 1, index: 2, total: 2 });
    const calls = view.hits.length;

    view.setCycleSet([a, b, { ...a }, { ...a }] as HintedElement[]);
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.hits.length, calls);
    assert.deepEqual(view.badges.at(-1), badge);
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("letters typed after an empty first batch are applied to the next batch", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    aggregator.handleRects(id, []);
    await tick();
    assert.equal(view.isStarted(), true);

    hinter.hitHint(id, "a" as SingleLetter);
    assert.equal(view.hits.length, 1);
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.batches[0][0].state, "hit");
    assert.equal(view.hits.length, 2);
    assert.ok(view.hits[1].includes(view.batches[0][0]));
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("a Cycle Key and an Action Key before the first rects call neither view.hit nor an action", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    sentTypes.length = 0;

    hinter.cycleHint(id);
    await hinter.removeHints(id, OPTIONS, true);

    assert.equal(view.hits.length, 0);
    assert.ok(!sentTypes.includes("ExecuteAction"));
  });

  void test("a Hint Letters change during a session applies from the next session", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    const four = [...RECTS, ...RECTS, ...RECTS, ...RECTS];
    aggregator.handleRects(id, four);
    await tick();
    hinter.setup("jkl;");
    aggregator.handleRects(id, RECTS);
    await tick();
    hinter.hitHint(id, "a" as SingleLetter);
    hinter.hitHint(id, "a" as SingleLetter);

    assert.deepEqual(
      view.batches.map((b) => b.map((t) => t.hint)),
      [["a", "s", "d", "f"], ["aa"]],
    );
    assert.equal(view.batches[1][0].state, "hit");
    await hinter.removeHints(id, OPTIONS, false);

    const next = hinter.attachHints();
    await tick();
    aggregator.handleRects(next, RECTS);
    await tick();
    assert.equal(view.batches[2][0].hint, "j");
    await hinter.removeHints(next, OPTIONS, false);
  });

  void test("a Hint Letters change before the session starts rendering applies from the next session", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    hinter.setup("jkl;");
    hinter.hitHint(id, "j" as SingleLetter);
    hinter.hitHint(id, "a" as SingleLetter);
    await tick();
    aggregator.handleRects(id, RECTS);
    await tick();

    assert.equal(view.batches[0][0].hint, "a");
    assert.equal(view.batches[0][0].state, "hit");
    await hinter.removeHints(id, OPTIONS, false);
  });

  void test("input after beginRemoveHints does not change the target of the action", async () => {
    hinter.setup("asdf");
    const id = hinter.attachHints();
    await tick();
    aggregator.handleRects(id, RECTS);
    await tick();
    hinter.hitHint(id, "a" as SingleLetter);
    const hits = view.hits.length;

    assert.equal(hinter.beginRemoveHints(id), true);
    hinter.hitHint(id, "s" as SingleLetter);
    hinter.cycleHint(id);
    assert.equal(view.hits.length, hits);
    sentTypes.length = 0;
    await hinter.removeHints(id, OPTIONS, true);

    assert.ok(sentTypes.includes("ExecuteAction"));
    assert.equal(hinter.beginRemoveHints(id), false);
  });
});
