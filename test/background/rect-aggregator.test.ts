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

const listener = aggregatorRouter.buildListener();

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

  void test("relays to targetFrameId without validation (root self-target)", async () => {
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

  void test("relays any targetFrameId directly (no registry check)", async () => {
    await call(
      "AllRectsRequest",
      { id: 2, targetFrameId: 5, viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].options?.frameId, 5);
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

  void test("parentFrameId > 0 → BlurRelay to parentFrameId", async () => {
    await call(
      "BlurUp",
      { parentFrameId: 0, rect: RECT },
      { tab: { id: TAB }, frameId: 11 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "BlurRoot");
    assert.equal(sent[0].options?.frameId, 0);
    assert.deepEqual(sent[0].payload, { rect: RECT });
  });

  void test("parentFrameId === 0 → BlurRoot to frame 0", async () => {
    await call(
      "BlurUp",
      { parentFrameId: 0, rect: RECT },
      { tab: { id: TAB }, frameId: 11 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "BlurRoot");
    assert.equal(sent[0].options?.frameId, 0);
    assert.deepEqual(sent[0].payload, { rect: RECT });
  });

  void test("non-zero parentFrameId → BlurRelay to that frame", async () => {
    await call(
      "BlurUp",
      { parentFrameId: 5, rect: RECT },
      { tab: { id: TAB }, frameId: 11 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "BlurRelay");
    assert.equal(sent[0].options?.frameId, 5);
    assert.deepEqual(sent[0].payload, { childFrameId: 11, rect: RECT });
  });
});
