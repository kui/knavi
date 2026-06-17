import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

interface PostedMessage {
  data: unknown;
  targetOrigin: string;
}

const postedToParent: PostedMessage[] = [];
const messageListeners: ((e: MessageEvent) => void)[] = [];
const sentToRuntime: { type: string; payload: unknown }[] = [];

const fakeWindow = {
  addEventListener: (type: string, l: (e: MessageEvent) => void) => {
    if (type === "message") messageListeners.push(l);
  },
};

(globalThis as Record<string, unknown>).window = fakeWindow;

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    connect: () => ({}),
    sendMessage: (msg: { "@type": string }) => {
      sentToRuntime.push({ type: msg["@type"], payload: msg });
      if (msg["@type"] === "GetFrameId")
        return Promise.resolve({ response: 42 });
      return Promise.resolve({ response: undefined });
    },
  },
};

function setParent(p: unknown) {
  (globalThis as Record<string, unknown>).parent = p;
}

setParent({
  postMessage: (data: unknown, targetOrigin: string) =>
    postedToParent.push({ data, targetOrigin }),
});

const { announceFrameIdToParent, onChildFrameId, setupFrameRegistration } =
  await import("../../src/content-all/frame-registration.js");

function fireMessage(event: Partial<MessageEvent>) {
  for (const l of messageListeners) l(event as MessageEvent);
}

// onChildFrameId duck-types `"window" in source` to identify a Window source.
// A real Window has a self-referential `window` property.
function makeWindowSource(): Window {
  const w: Record<string, unknown> = {};
  w.window = w;
  return w as unknown as Window;
}

void describe("announceFrameIdToParent", () => {
  beforeEach(() => {
    postedToParent.length = 0;
    sentToRuntime.length = 0;
  });

  void test("no-ops when running in the root frame", async () => {
    setParent(fakeWindow); // parent === window
    announceFrameIdToParent();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(postedToParent.length, 0);
    assert.equal(sentToRuntime.length, 0);
  });

  void test("posts {@type, frameId} to parent with targetOrigin '*'", async () => {
    const fakeParent = {
      postMessage: (data: unknown, targetOrigin: string) =>
        postedToParent.push({ data, targetOrigin }),
    };
    setParent(fakeParent);
    announceFrameIdToParent();
    // Let the GetFrameId promise resolve.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(postedToParent.length, 1);
    assert.deepEqual(postedToParent[0], {
      data: {
        "@type": "com.github.kui.knavi.FrameIdAnnouncement",
        frameId: 42,
      },
      targetOrigin: "*",
    });
  });
});

void describe("onChildFrameId", () => {
  void test("invokes callback with frameId and source window", () => {
    const calls: { frameId: number; source: Window }[] = [];
    onChildFrameId((frameId, source) => calls.push({ frameId, source }));

    const fakeSource = makeWindowSource();
    fireMessage({
      data: { "@type": "com.github.kui.knavi.FrameIdAnnouncement", frameId: 7 },
      source: fakeSource,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].frameId, 7);
    assert.equal(calls[0].source, fakeSource);
  });

  void test("ignores messages with wrong @type", () => {
    const calls: number[] = [];
    onChildFrameId((frameId) => calls.push(frameId));

    const src = makeWindowSource();
    fireMessage({
      data: { "@type": "something.else", frameId: 1 },
      source: src,
    });
    fireMessage({ data: null, source: src });
    fireMessage({ data: undefined, source: src });

    assert.equal(calls.length, 0);
  });

  void test("ignores non-Window sources (no `window` property)", () => {
    const calls: number[] = [];
    onChildFrameId((frameId) => calls.push(frameId));

    const announcement = {
      "@type": "com.github.kui.knavi.FrameIdAnnouncement",
      frameId: 9,
    };
    // MessagePort/ServiceWorker do not expose a `window` property.
    fireMessage({
      data: announcement,
      source: {} as unknown as MessageEventSource,
    });
    fireMessage({ data: announcement, source: null });

    assert.equal(calls.length, 0);
  });
});

void describe("setupFrameRegistration UnregisterChildFrame handler", () => {
  void test("clears both Maps when UnregisterChildFrame arrives", () => {
    setParent(fakeWindow); // skip announce / connect side-effects
    const { iframeByFrameId, iframeToFrameId, router } =
      setupFrameRegistration();

    const fakeIframe = {} as HTMLIFrameElement;
    iframeByFrameId.set(7, fakeIframe);
    iframeToFrameId.set(fakeIframe, 7);

    const listener = router.buildListener();
    listener(
      { "@type": "UnregisterChildFrame", childFrameId: 7 },
      {},
      () => undefined,
    );

    assert.equal(iframeByFrameId.has(7), false);
    assert.equal(iframeToFrameId.has(fakeIframe), false);
  });

  void test("is a no-op for an unknown childFrameId", () => {
    setParent(fakeWindow);
    const { iframeByFrameId, iframeToFrameId, router } =
      setupFrameRegistration();

    const fakeIframe = {} as HTMLIFrameElement;
    iframeByFrameId.set(1, fakeIframe);
    iframeToFrameId.set(fakeIframe, 1);

    const listener = router.buildListener();
    listener(
      { "@type": "UnregisterChildFrame", childFrameId: 999 },
      {},
      () => undefined,
    );

    assert.equal(iframeByFrameId.get(1), fakeIframe);
    assert.equal(iframeToFrameId.get(fakeIframe), 1);
  });
});
