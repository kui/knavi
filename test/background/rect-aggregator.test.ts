import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

type SendMessage = (
  tabId: number,
  message: { "@type": string; [k: string]: unknown },
  options?: { frameId?: number },
) => Promise<{ response: unknown }>;

interface SentCall {
  tabId: number;
  type: string;
  payload: Record<string, unknown>;
  options?: { frameId?: number };
}

const sent: SentCall[] = [];
const noop = (): void => undefined;

const sendToTabImpl: SendMessage = (tabId, message, options) => {
  const { "@type": type, ...payload } = message;
  sent.push({ tabId, type, payload, options });
  return Promise.resolve({ response: undefined });
};

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    onConnect: { addListener: noop },
  },
  tabs: {
    onRemoved: { addListener: noop },
    sendMessage: sendToTabImpl,
  },
};

const { router: aggregatorRouter } =
  await import("../../src/background/rect-aggregator.js");
const { router: registryRouter } =
  await import("../../src/background/frame-registry.js");

const listener = aggregatorRouter.merge(registryRouter).buildListener();

function call(
  type: string,
  payload: Record<string, unknown>,
  sender: { tab?: { id?: number }; frameId?: number },
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    (
      listener as unknown as (
        m: { "@type": string; [k: string]: unknown },
        s: chrome.runtime.MessageSender,
        r: (arg: { response?: unknown; error?: Error }) => void,
      ) => void
    )(
      { "@type": type, ...payload },
      sender as chrome.runtime.MessageSender,
      (arg) => {
        if (arg.error) reject(arg.error);
        else resolve(arg.response);
      },
    );
  });
}

function registerChild(
  tabId: number,
  parentFrameId: number,
  childFrameId: number,
) {
  return call(
    "RegisterChildFrame",
    { childFrameId },
    { tab: { id: tabId }, frameId: parentFrameId },
  );
}

const TAB = 100;
const VIEWPORT = {
  type: "actual-viewport",
  origin: "root-viewport",
  x: 0,
  y: 0,
  width: 800,
  height: 600,
};
const OFFSETS = {
  type: "layout-viewport",
  origin: "root-viewport",
  x: 0,
  y: 0,
};

void describe("background AllRectsRequest routing", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  void test("allows self-target (root bootstrapping its own aggregate)", async () => {
    await call(
      "AllRectsRequest",
      { id: 1, targetFrameId: 0, viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      tabId: TAB,
      type: "AllRectsRequest",
      payload: {
        id: 1,
        targetFrameId: 0,
        viewport: VIEWPORT,
        offsets: OFFSETS,
      },
      options: { frameId: 0 },
    });
  });

  void test("allows parent → registered child propagation", async () => {
    await registerChild(TAB, 0, 5);

    await call(
      "AllRectsRequest",
      { id: 2, targetFrameId: 5, viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].options?.frameId, 5);
  });

  void test("drops requests where sender is not the registered parent", async () => {
    await registerChild(TAB, 0, 5);

    // Frame 99 pretends to address frame 5, but its registered parent is 0.
    await call(
      "AllRectsRequest",
      { id: 3, targetFrameId: 5, viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 99 },
    );

    assert.equal(sent.length, 0);
  });

  void test("drops requests for unregistered targets", async () => {
    await call(
      "AllRectsRequest",
      { id: 4, targetFrameId: 7, viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );

    assert.equal(sent.length, 0);
  });
});

void describe("background BlurUp routing", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  const RECT = {
    type: "element-border",
    origin: "layout-viewport",
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  };

  void test("registered child → BlurRelay to its parent", async () => {
    await registerChild(TAB, 0, 11);

    await call("BlurUp", { rect: RECT }, { tab: { id: TAB }, frameId: 11 });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "BlurRelay");
    assert.equal(sent[0].options?.frameId, 0);
    assert.deepEqual(sent[0].payload, { childFrameId: 11, rect: RECT });
  });

  void test("root frame (frameId 0) → BlurRoot to frame 0", async () => {
    await call("BlurUp", { rect: RECT }, { tab: { id: TAB }, frameId: 0 });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "BlurRoot");
    assert.equal(sent[0].options?.frameId, 0);
    assert.deepEqual(sent[0].payload, { rect: RECT });
  });

  void test("unregistered non-root sender → dropped, no sendToTab", async () => {
    await call("BlurUp", { rect: RECT }, { tab: { id: TAB }, frameId: 42 });

    assert.equal(sent.length, 0);
  });
});
