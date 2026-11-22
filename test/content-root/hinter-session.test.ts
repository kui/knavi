import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { SingleLetter } from "../../src/lib/strings.js";

/* WHY: wires the real background router, content-root hinter and several
   frames' HinterClients through a fake message bus whose SyncHintingState
   delivery each test orders by hand, to reproduce the orderings of #169/#170. */

interface Msg {
  "@type": string;
  active?: boolean;
  sessionId?: unknown;
}
type Listener = (
  m: Msg,
  s: chrome.runtime.MessageSender,
  r: (arg: unknown) => void,
) => boolean | void;

const TAB = 1;
let backgroundListener: Listener = () => undefined;
let rootListener: Listener = () => undefined;
const frames: Frame[] = [];
/** Messages to content-root of these types wait until the test releases them. */
const held = new Map<string, (() => void)[]>();
let actions = 0;

function call(listener: Listener, msg: Msg, frameId: number) {
  return new Promise<unknown>((resolve) => {
    const handled = listener(
      msg,
      { tab: { id: TAB }, frameId } as chrome.runtime.MessageSender,
      resolve,
    );
    if (handled === undefined) resolve({ response: undefined });
  });
}

console.debug = () => undefined;
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).parent = globalThis;
(globalThis as Record<string, unknown>).document = { body: {} };
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: (msg: Msg) => call(backgroundListener, msg, 0),
  },
  tabs: {
    sendMessage: async (
      _tabId: number,
      msg: Msg,
      options: chrome.tabs.MessageSendOptions = {},
    ) => {
      if (options.frameId === 0) {
        const gate = held.get(msg["@type"]);
        if (gate) await new Promise<void>((resolve) => gate.push(resolve));
        return call(rootListener, msg, 0);
      }
      for (const f of frames) f.inbox.push(msg);
      return { response: undefined };
    },
  },
};

const { default: HinterClient } =
  await import("../../src/lib/hinter-client.js");
const { HinterContentRoot, buildHinterRouter } =
  await import("../../src/content-root/hinter.js");
const { router: backgroundRouter } =
  await import("../../src/background/hinter.js");

class Frame {
  readonly client = new HinterClient();
  inbox: Msg[] = [];
  constructor() {
    frames.push(this);
  }
  /** Delivers the SyncHintingState messages matching `pred`, in arrival order. */
  deliver(pred: (m: Msg) => boolean = () => true) {
    const now = this.inbox.filter(pred);
    this.inbox = this.inbox.filter((m) => !pred(m));
    for (const m of now) this.receive(m);
  }
  receive(m: Msg) {
    /* WHY: the same call shape as the SyncHintingState router entry in
       content-all.ts. */
    (this.client.syncHinting as (active: boolean, sessionId: unknown) => void)(
      m.active ?? false,
      m.sessionId,
    );
  }
  /** Removes and returns the messages held in the inbox. */
  take(): Msg[] {
    const taken = this.inbox;
    this.inbox = [];
    return taken;
  }
}

function hold(type: string): () => void {
  const gate: (() => void)[] = [];
  held.set(type, gate);
  return () => {
    held.delete(type);
    gate.forEach((release) => release());
  };
}

async function settle() {
  for (let i = 0; i < 10; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

const OPTIONS = {
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

void describe("hint session ordering across frames", () => {
  let A: Frame, B: Frame;

  beforeEach(() => {
    frames.length = 0;
    held.clear();
    actions = 0;
    const view = {
      isStarted: () => false,
      start: () => undefined,
      render: () => undefined,
      remove: () => undefined,
      hit: () => undefined,
    };
    const aggregator = {
      // eslint-disable-next-line @typescript-eslint/require-await, require-yield
      async *aggregate() {
        return;
      },
      action: () => {
        actions++;
        return Promise.resolve();
      },
    };
    const root = new HinterContentRoot(aggregator as never, view as never);
    root.setup("asdf");
    rootListener = buildHinterRouter(root).buildListener() as Listener;
    backgroundListener = backgroundRouter.buildListener() as Listener;
    A = new Frame();
    B = new Frame();
  });

  void test("(a) a stale false of the previous session after the own attach is ignored", async () => {
    A.client.attachHints().catch(() => undefined);
    await settle();
    A.deliver();
    B.deliver();
    await A.client.removeHints(OPTIONS, false);
    const staleFalse = A.take();

    A.client.attachHints().catch(() => undefined);
    await settle();
    A.deliver();
    staleFalse.forEach((m) => A.receive(m));

    assert.equal(A.client.isHinting, true);
    assert.equal(A.client.ownsSession, true);
  });

  void test("#169 window: a stale false between the AttachHints request and its reply is ignored", async () => {
    A.client.attachHints().catch(() => undefined);
    await settle();
    A.deliver();
    await A.client.removeHints(OPTIONS, false);
    const staleFalse = A.take();

    const release = hold("AttachHintsInTab");
    A.client.attachHints().catch(() => undefined);
    await settle();
    staleFalse.forEach((m) => A.receive(m));
    assert.equal(A.client.isHinting, true);

    release();
    await settle();
    A.deliver();
    assert.equal(A.client.isHinting, true);
  });

  void test("(b) RemoveHints from a frame that still thinks it owns the previous session does not end the newer one", async () => {
    A.client.attachHints().catch(() => undefined);
    await settle();
    B.deliver();
    await B.client.removeHints(OPTIONS, false);
    B.deliver();
    B.client.attachHints().catch(() => undefined);
    await settle();
    B.deliver();
    assert.equal(actions, 1);
    // WHY: A's inbox still holds false(s1) and true(s2), so A believes it owns s1.
    assert.equal(A.client.ownsSession, true);

    await A.client.removeHints(OPTIONS, false);
    await settle();
    assert.equal(actions, 1);

    await B.client.removeHints(OPTIONS, false);
    assert.equal(actions, 2);
  });

  void test("(c) a rejected attach from another frame does not clear the live session", async () => {
    A.client.attachHints().catch(() => undefined);
    await settle();
    A.deliver();

    // WHY: B has not received true(s1) yet, so it starts its own attach.
    await assert.rejects(B.client.attachHints(), /already started/);
    await settle();
    A.deliver();
    B.deliver();

    assert.equal(A.client.isHinting, true);
    assert.equal(A.client.ownsSession, true);
    assert.equal(B.client.isHinting, true);
    assert.equal(B.client.ownsSession, false);
  });

  void test("(d) a late true of an older session does not move ownership back", async () => {
    A.client.attachHints().catch(() => undefined);
    await settle();
    B.deliver();
    await A.client.removeHints(OPTIONS, false);
    await settle();
    B.deliver();
    B.client.attachHints().catch(() => undefined);
    await settle();

    const [trueS1, ...rest] = A.take();
    assert.equal(trueS1?.active, true);
    rest.forEach((m) => A.receive(m));
    A.receive(trueS1);

    assert.equal(A.client.isHinting, true);
    assert.equal(A.client.ownsSession, false);
  });

  void test("letters typed in the #169 window reach the new session", async () => {
    A.client.attachHints().catch(() => undefined);
    await settle();
    A.deliver();
    await A.client.removeHints(OPTIONS, false);
    const staleFalse = A.take();

    const release = hold("AttachHintsInTab");
    A.client.attachHints().catch(() => undefined);
    await settle();
    staleFalse.forEach((m) => A.receive(m));
    const hit = A.client.hitHint("a" as SingleLetter);
    release();
    await hit;
    await settle();
    A.deliver();
    await A.client.removeHints(OPTIONS, false);
    assert.equal(actions, 2);
  });
});
