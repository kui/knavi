import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

/**
 * Runs the hint session protocol of several frames, the background and
 * content-root in one process. Every message delivery and every reply is a
 * task of a fast-check scheduler, so each run delivers them in a different
 * order, interleaved with the user's key events. Rects are collected through
 * the background's AllRectsRequest routing and frame path table, from frames
 * nested in one another.
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
/** Frame i has frameId i and is the only child of frame i - 1. */
const framePathOf = (frameId: number) => Array<string>(frameId).fill("0");
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
      currentWorld().deliver(backgroundListener, message, 0),
  },
  tabs: {
    sendMessage: (
      _tabId: number,
      message: Message,
      options: chrome.tabs.MessageSendOptions = {},
    ) => {
      const w = currentWorld();
      if (options.frameId === 0) return w.deliver(w.topListener, message, 0);
      if (options.frameId != null) {
        return w.deliver(w.frames[options.frameId].listener, message, 0);
      }
      if (message["@type"] === "SyncHintingState" && !message.active) {
        w.countFalse(message.sessionId as number);
      }
      return Promise.all(
        w.frames.map((f) => w.deliver(f.listener, message, 0)),
      );
    },
  },
};

const errors: unknown[] = [];
console.debug = () => undefined;
// WHY: rects that reach content-root after their session ended are logged.
console.warn = () => undefined;
console.error = (e: unknown) => errors.push(e);

const { Router } = await import("../../src/lib/chrome-messages.js");
const { printError } = await import("../../src/lib/errors.js");
const { default: HinterClient } =
  await import("../../src/lib/hinter-client.js");
const { KeyboardHandlerContentAll } =
  await import("../../src/content-all/keyboard-handler.js");
const { HinterContentRoot, buildHinterRouter } =
  await import("../../src/content-root/hinter.js");
const { RectAggregatorClient } =
  await import("../../src/content-root/rect-aggregator-client.js");
const { router: backgroundRouter } =
  await import("../../src/background/hinter.js");
const { router: backgroundRectRouter } =
  await import("../../src/background/rect-aggregator.js");
const framePaths = await import("../../src/background/frame-paths.js");

const backgroundListener = Router.newRuntimeInstance()
  .merge(backgroundRectRouter)
  .merge(backgroundRouter)
  .buildListener() as Listener;

/** Mirrors HintView's preconditions: start() once, render() and hit() only after it. */
class FakeView {
  started = false;
  /** The frames whose rects were rendered since start(). */
  readonly renderedFrames = new Set<number>();
  isStarted = () => this.started;
  start() {
    if (this.started) throw Error("view already started");
    this.started = true;
    this.renderedFrames.clear();
  }
  render(targets: HintedElement[]) {
    if (!this.started) throw Error("render before start");
    for (const t of targets) this.renderedFrames.add(t.id.frameId);
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

/** The content-all side of a frame, wired as in content-all.ts. */
class Frame {
  readonly client = new HinterClient();
  blacklisted = false;
  readonly keys = new KeyboardHandlerContentAll(null as never, this.client);
  readonly path: string[];
  readonly listener: Listener;
  private readonly w: World;
  readonly frameId: number;

  constructor(w: World, frameId: number) {
    this.w = w;
    this.frameId = frameId;
    this.path = framePathOf(frameId);
    this.listener = Router.newTabInstance()
      .add("ExecuteActionInFrame", () => undefined)
      .add("SyncHintingState", ({ active, sessionId }) => {
        if (this.client.syncHinting(active, sessionId) && active)
          this.send({ "@type": "ReportFramePath", path: this.path });
      })
      .add("AllRectsRequest", (request) => {
        if (request.targetPath.join() !== this.path.join()) return;
        this.send({
          "@type": "ResponseRectsFragment",
          sessionId: request.sessionId,
          rects: [
            {
              id: { frameId: this.frameId, index: 0 },
              rects: [],
              descriptions: { short: "link" },
            },
          ],
        });
        if (this.frameId + 1 < FRAME_COUNT)
          this.send({
            "@type": "AllRectsRequest",
            ...request,
            targetPath: framePathOf(this.frameId + 1),
          });
      })
      .buildListener() as Listener;
    this.keys.setup(SETTINGS, [], this.keys.newBlacklistTicket());
  }

  private send(message: Message) {
    this.w.deliver(backgroundListener, message, this.frameId).catch(printError);
  }

  setBlacklisted(blacklisted: boolean) {
    this.blacklisted = blacklisted;
    this.keys.updateBlacklist(
      blacklisted ? ["example.com"] : [],
      this.keys.newBlacklistTicket(),
    );
  }
}

class World {
  readonly view = new FakeView();
  readonly frames: Frame[];
  /** content-root and content-all of the top frame, as one listener. */
  readonly topListener: Listener;
  /** How many times content-root confirmed each session live on removal. */
  private readonly confirmed = new Map<number, number>();
  private readonly falses = new Map<number, number>();
  readonly unconfirmedFalses: number[] = [];
  private readonly scheduler: fc.Scheduler;

  constructor(scheduler: fc.Scheduler) {
    this.scheduler = scheduler;
    // WHY: the table is module state and outlives the previous run's world.
    framePaths.forgetTab(TAB_ID);
    this.frames = Array.from(
      { length: FRAME_COUNT },
      (_, i) => new Frame(this, i),
    );
    const aggregator = new RectAggregatorClient();
    const hinter = new HinterContentRoot(aggregator, this.view as never);
    hinter.setup(SETTINGS.hints);
    const rootListener = Router.newTabInstance()
      .add("ResponseRectsFragment", (m) => {
        aggregator.handleRects(m.sessionId, m.rects);
      })
      .merge(buildHinterRouter(hinter))
      .buildListener() as Listener;
    const top = this.frames[0];
    this.topListener = (message, sender, sendResponse) => {
      let respond = sendResponse;
      if (message["@type"] === "BeginRemoveHintsInTab") {
        const id = message.sessionId as number;
        respond = (arg) => {
          if ((arg as { response?: unknown }).response === true)
            this.confirmed.set(id, (this.confirmed.get(id) ?? 0) + 1);
          sendResponse(arg);
        };
      }
      return (
        rootListener(message, sender, respond) ??
        top.listener(message, sender, respond)
      );
    };
  }

  /** Records a SyncHintingState(false) broadcast of session `id`. */
  countFalse(id: number) {
    const count = (this.falses.get(id) ?? 0) + 1;
    this.falses.set(id, count);
    if (count > (this.confirmed.get(id) ?? 0)) this.unconfirmedFalses.push(id);
  }

  /** Delivers the message and its reply, each when the scheduler picks it. */
  async deliver(
    listener: Listener,
    message: Message,
    frameId: number,
  ): Promise<unknown> {
    const type = message["@type"];
    await this.scheduler.schedule(Promise.resolve(), `deliver ${type}`);
    const reply = await new Promise((resolve) => {
      let answered = false;
      const async = listener(
        message,
        { tab: { id: TAB_ID }, frameId } as chrome.runtime.MessageSender,
        (arg) => {
          answered = true;
          resolve(arg);
        },
      );
      if (!async && !answered) resolve(undefined);
    });
    return this.scheduler.schedule(Promise.resolve(reply), `reply ${type}`);
  }

  press(action: Action) {
    const f = this.frames[action.frame];
    if (action.type === "blacklist") {
      f.setBlacklisted(action.match);
      return;
    }
    const { type, code } = action;
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

/** The frame's page starts or stops matching the blacklist, e.g. an in-page navigation. */
interface BlacklistAction {
  frame: number;
  type: "blacklist";
  match: boolean;
}

type Action = KeyAction | BlacklistAction;

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

const blacklistAction: fc.Arbitrary<BlacklistAction> = fc.record({
  frame: fc.integer({ min: 0, max: FRAME_COUNT - 1 }),
  type: fc.constant("blacklist"),
  match: fc.boolean(),
});

const action: fc.Arbitrary<Action> = fc.oneof(
  { arbitrary: keyAction, weight: 4 },
  { arbitrary: blacklistAction, weight: 1 },
);

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
  assert.equal(
    w.frames.some((f) => f.blacklisted && f.client.ownsSession),
    false,
    "a frame whose blacklist matches owns no session",
  );
  if (w.view.started) {
    assert.deepEqual(
      [...w.view.renderedFrames].sort(),
      w.frames.map((f) => f.frameId),
      "every frame's rects reach content-root",
    );
  }
  assert.deepEqual(
    w.unconfirmedFalses,
    [],
    "SyncHintingState(false) is broadcast only for a session content-root confirmed live",
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
      fc.array(action, { maxLength: 16 }),
      async (s, actions) => {
        errors.length = 0;
        const w = new World(s);
        world = w;
        s.scheduleSequence(
          actions.map((a) => ({
            label:
              a.type === "blacklist"
                ? `blacklist ${a.match} in frame ${a.frame}`
                : `${a.type} ${a.code} in frame ${a.frame}`,
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
        g.setBlacklisted(false);
        g.keys.handleBlur();
        g.keys.handleKeydown(keyEvent("keydown", "KeyQ"));
        await s.waitIdle();
        assertSettled(w);
        assert.equal(w.view.started, true, "the sticky key starts a session");
        assert.equal(g.client.ownsSession, true);

        /* WHY: a frame that does not own the session can still end it after
           its page starts matching the blacklist (#196). */
        const h = w.frames[1];
        h.setBlacklisted(true);
        await s.waitIdle();
        assert.equal(w.view.started, true, "the owner's session stays live");
        h.keys.handleBlur();
        h.keys.handleKeydown(keyEvent("keydown", "Escape"));
        await s.waitIdle();
        assertSettled(w);
        assert.equal(
          w.view.started,
          false,
          "Escape from a blacklisted frame ends the session",
        );
      },
    ),
    { numRuns: NUM_RUNS },
  );
});
