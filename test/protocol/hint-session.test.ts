import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

/**
 * Runs the hint session protocol of several frames, the background and
 * content-root in one process. Every message delivery and every reply is a
 * task of a fast-check scheduler, so each run delivers them in a different
 * order, interleaved with the user's key events.
 */

type Message = { "@type": string } & Record<string, unknown>;
type Listener = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (arg: unknown) => void,
) => boolean | void;

/* WHY: a bug that needs two sessions in a rare delivery order shows up in
   about one run in 1500; raise the count to search harder locally. */
const NUM_RUNS = Number(process.env.KNAVI_PROTOCOL_RUNS ?? 3000);
const TAB_ID = 1;
const FRAME_COUNT = 3;
const SETTINGS = {
  magicKey: "Space",
  stickyKey: "KeyQ",
  cancelKey: "Escape",
  actionKey: "Enter",
  cycleKey: "Tab",
  blurKey: "",
  hints: "asdf",
};

let world: World | null = null;
const currentWorld = () => {
  if (!world) throw Error("no world");
  return world;
};

(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).parent = globalThis;
(globalThis as Record<string, unknown>).document = {
  body: {},
  activeElement: null,
  documentElement: { clientWidth: 800, clientHeight: 600 },
};
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: (message: Message) =>
      currentWorld().deliver(backgroundListener, message),
  },
  tabs: {
    sendMessage: (
      _tabId: number,
      message: Message,
      options: chrome.tabs.MessageSendOptions = {},
    ) => {
      const w = currentWorld();
      if (options.frameId === 0) return w.deliver(w.rootListener, message);
      return Promise.all(w.frames.map((f) => w.deliver(f.listener, message)));
    },
  },
};

const errors: unknown[] = [];
console.debug = () => undefined;
console.error = (e: unknown) => errors.push(e);

const { Router } = await import("../../src/lib/chrome-messages.js");
const { default: HinterClient } =
  await import("../../src/lib/hinter-client.js");
const { KeyboardHandlerContentAll } =
  await import("../../src/content-all/keyboard-handler.js");
const { HinterContentRoot, buildHinterRouter } =
  await import("../../src/content-root/hinter.js");
const { router: backgroundRouter } =
  await import("../../src/background/hinter.js");

const backgroundListener = backgroundRouter.buildListener() as Listener;

/** Mirrors HintView's preconditions: start() once, render() and hit() only after it. */
class FakeView {
  started = false;
  isStarted = () => this.started;
  start() {
    if (this.started) throw Error("view already started");
    this.started = true;
  }
  render() {
    if (!this.started) throw Error("render before start");
  }
  hit() {
    if (!this.started) throw Error("hit before start");
  }
  remove() {
    if (!this.started) throw Error("remove before start");
    this.started = false;
  }
  computeCycleSet = (hit: HintedElement) => [hit];
}

class Frame {
  readonly client = new HinterClient();
  readonly keys = new KeyboardHandlerContentAll(null as never, this.client);
  readonly listener = Router.newTabInstance()
    .add("SyncHintingState", ({ active, sessionId }) => {
      this.client.syncHinting(active, sessionId);
    })
    .buildListener() as Listener;

  constructor() {
    this.keys.setup(SETTINGS, [], this.keys.newBlacklistTicket());
  }
}

class World {
  readonly view = new FakeView();
  readonly frames = Array.from({ length: FRAME_COUNT }, () => new Frame());
  readonly rootListener: Listener;
  private readonly scheduler: fc.Scheduler;

  constructor(scheduler: fc.Scheduler) {
    this.scheduler = scheduler;
    const element = {
      id: { frameId: 0, index: 0 },
      rects: [],
      descriptions: { short: "link" },
    };
    const aggregator = {
      aggregate: async function* () {
        await scheduler.schedule(Promise.resolve(), "rects");
        yield [element];
      },
      action: () => scheduler.schedule(Promise.resolve(), "action"),
    };
    const hinter = new HinterContentRoot(
      aggregator as never,
      this.view as never,
    );
    hinter.setup(SETTINGS.hints);
    this.rootListener = buildHinterRouter(hinter).buildListener() as Listener;
  }

  /** Delivers the message and its reply, each when the scheduler picks it. */
  async deliver(listener: Listener, message: Message): Promise<unknown> {
    const type = message["@type"];
    await this.scheduler.schedule(Promise.resolve(), `deliver ${type}`);
    const reply = await new Promise((resolve) => {
      let answered = false;
      const async = listener(
        message,
        { tab: { id: TAB_ID }, frameId: 0 } as chrome.runtime.MessageSender,
        (arg) => {
          answered = true;
          resolve(arg);
        },
      );
      if (!async && !answered) resolve(undefined);
    });
    return this.scheduler.schedule(Promise.resolve(reply), `reply ${type}`);
  }

  press({ frame, type, code }: KeyAction) {
    const f = this.frames[frame];
    if (type === "blur") {
      f.keys.handleBlur();
      return;
    }
    const event = keyEvent(type, code);
    if (type === "keydown") f.keys.handleKeydown(event);
    else f.keys.handleKeyup(event);
  }
}

interface KeyAction {
  frame: number;
  type: "keydown" | "keyup" | "blur";
  code: keyof typeof KEYS;
}

const KEYS = {
  Space: " ",
  KeyQ: "q",
  KeyA: "a",
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
};

function keyEvent(type: "keydown" | "keyup", code: keyof typeof KEYS) {
  return {
    type,
    key: KEYS[code],
    code,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  } as KeyboardEvent;
}

const keyAction: fc.Arbitrary<KeyAction> = fc.record({
  frame: fc.integer({ min: 0, max: FRAME_COUNT - 1 }),
  type: fc.constantFrom("keydown", "keyup", "blur"),
  code: fc.constantFrom(...(Object.keys(KEYS) as (keyof typeof KEYS)[])),
});

/** Errors the protocol reports by design, not bugs. */
function isExpectedError(e: unknown) {
  /* WHY: two frames can start a session at once; content-root accepts the
     first and rejects the other. */
  return e instanceof Error && e.message.includes("already started hinting");
}

function assertSettled(w: World) {
  const hinting = w.frames.map((f) => f.client.isHinting);
  assert.deepEqual(
    hinting,
    hinting.map(() => w.view.started),
    "every frame agrees with content-root on whether a session is live",
  );
  const owners = w.frames.filter((f) => f.client.ownsSession).length;
  assert.equal(
    owners,
    w.view.started ? 1 : 0,
    "a live session has exactly one owning frame",
  );
  assert.deepEqual(
    errors.filter((e) => !isExpectedError(e)),
    [],
  );
}

void test("frames, the background and content-root settle on one session state in any delivery order", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.scheduler(),
      fc.array(keyAction, { maxLength: 16 }),
      async (s, actions) => {
        errors.length = 0;
        const w = new World(s);
        world = w;
        s.scheduleSequence(
          actions.map((a) => ({
            label: `${a.type} ${a.code} in frame ${a.frame}`,
            builder: () => {
              w.press(a);
              return Promise.resolve();
            },
          })),
        );
        await s.waitIdle();
        assertSettled(w);

        /* WHY: whatever state the actions left, the user can still end the
           session from any frame. */
        const f = w.frames[FRAME_COUNT - 1];
        f.keys.handleBlur();
        f.keys.handleKeydown(keyEvent("keydown", "Escape"));
        await s.waitIdle();
        assertSettled(w);
        assert.equal(w.view.started, false, "Escape ends the session");

        /* WHY: and can start the next one, from a frame other than the one
           that ended it. */
        const g = w.frames[0];
        g.keys.handleBlur();
        g.keys.handleKeydown(keyEvent("keydown", "KeyQ"));
        await s.waitIdle();
        assertSettled(w);
        assert.equal(w.view.started, true, "the sticky key starts a session");
        assert.equal(g.client.ownsSession, true);
      },
    ),
    { numRuns: NUM_RUNS },
  );
});
