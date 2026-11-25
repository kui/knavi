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
/** Messages that reached content-root, in order. */
let rootReceived: Msg[] = [];

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
        rootReceived.push(msg);
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
    (this.client.syncHinting as (state: unknown) => void)(m);
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
  let root: InstanceType<typeof HinterContentRoot>;

  /** Replaces content-root with one whose settings have not loaded yet. */
  function rootBeforeSetup() {
    root = new HinterContentRoot(aggregator as never, view as never);
    rootListener = buildHinterRouter(root).buildListener() as Listener;
  }

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

  beforeEach(() => {
    frames.length = 0;
    held.clear();
    actions = 0;
    rootReceived = [];
    rootBeforeSetup();
    root.setup("asdf");
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

  void test("#195: RemoveHints from a frame that still thinks it owns the previous session broadcasts no false", async () => {
    const C = new Frame();
    A.client.attachHints().catch(() => undefined);
    await settle();
    B.deliver();
    C.deliver();
    await B.client.removeHints(OPTIONS, false);
    B.deliver();
    B.client.attachHints().catch(() => undefined);
    await settle();
    B.deliver();
    // WHY: A and C still hold false(s1) and true(s2); C has seen only true(s1).
    assert.equal(A.client.ownsSession, true);
    const pending = C.take();

    await A.client.removeHints(OPTIONS, false);
    await settle();
    C.deliver();
    assert.equal(C.client.isHinting, true);

    pending.forEach((m) => C.receive(m));
    assert.equal(C.client.isHinting, true);
    assert.equal(C.client.ownsSession, false);
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
    const started = A.inbox.find((m) => m.active);
    const hits = rootReceived.filter((m) => m["@type"] === "HitHintInTab");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.sessionId, started?.sessionId);
  });

  void test("releasing the magic key before content-root accepts ends the session once in every frame", async () => {
    const release = hold("AttachHintsInTab");
    A.client.attachHints().catch(() => undefined);
    await settle();
    assert.equal(A.client.isHinting, true);
    const removed = A.client.removeHints(OPTIONS, true);
    assert.equal(A.client.isHinting, false);
    release();
    await removed;
    await settle();
    A.deliver();
    B.deliver();
    assert.equal(actions, 1);
    assert.equal(A.client.isHinting, false);
    assert.equal(B.client.isHinting, false);

    await A.client.attachHints();
    await settle();
    A.deliver();
    B.deliver();
    assert.equal(A.client.ownsSession, true);
    assert.equal(B.client.isHinting, true);
  });

  void test("a frame whose attach was rejected can still end the live session", async () => {
    await A.client.attachHints();
    await settle();
    await assert.rejects(B.client.attachHints());
    B.deliver();
    assert.equal(B.client.isHinting, true);
    assert.equal(B.client.ownsSession, false);

    await B.client.removeHints(OPTIONS, false);
    await settle();
    A.deliver();
    assert.equal(A.client.isHinting, false);
    assert.equal(actions, 1);
  });

  void test("removeHints while content-root's settings are loading ends the session without waiting for them", async () => {
    rootBeforeSetup();
    A.client.attachHints().catch(() => undefined);
    await settle();
    await A.client.removeHints(OPTIONS, false);
    await settle();
    assert.equal(actions, 1);
    A.deliver();
    assert.equal(A.client.isHinting, false);

    await A.client.attachHints();
    assert.equal(A.client.ownsSession, true);
  });

  void test("the true broadcast is sent before content-root's settings have loaded", async () => {
    rootBeforeSetup();
    A.client.attachHints().catch(() => undefined);
    await settle();
    assert.deepEqual(
      B.inbox.map((m) => m.active),
      [true],
    );
    B.deliver();
    assert.equal(B.client.isHinting, true);
  });
});
