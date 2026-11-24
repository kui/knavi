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

const framePaths = await import("../../src/background/frame-paths.js");
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

function report(path: string[], frameId: number) {
  return call("ReportFramePath", { path }, { tab: { id: TAB }, frameId });
}

void describe("background AllRectsRequest routing", () => {
  beforeEach(() => {
    sent.length = 0;
    framePaths.reset(TAB, 1);
  });

  void test("routes the empty path to the top frame without a report", async () => {
    await call(
      "AllRectsRequest",
      { id: 1, targetPath: [], viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      tabId: TAB,
      type: "AllRectsRequest",
      payload: {
        id: 1,
        targetPath: [],
        viewport: VIEWPORT,
        offsets: OFFSETS,
      },
      options: { frameId: 0 },
    });
  });

  void test("routes to the frame that reported the path", async () => {
    await report(["1", "s0"], 5);
    await call(
      "AllRectsRequest",
      { id: 1, targetPath: ["1", "s0"], viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].options?.frameId, 5);
  });

  void test("waits for a path that is reported after the request", async () => {
    const request = call(
      "AllRectsRequest",
      { id: 1, targetPath: ["0"], viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(sent.length, 0);

    await report(["0"], 9);
    await request;

    assert.equal(sent.length, 1);
    assert.equal(sent[0].options?.frameId, 9);
  });

  void test("gives up when the path is never reported", async () => {
    assert.equal(await framePaths.lookup(TAB, 1, ["7"], 10), undefined);
  });

  void test("ignores a report from another frame for the top frame's path", async () => {
    await report([], 5);
    assert.equal(await framePaths.lookup(TAB, 1, [], 10), 0);
  });

  void test("keeps the first frame that reported a path", async () => {
    await report(["0"], 9);
    await report(["0"], 4);
    assert.equal(await framePaths.lookup(TAB, 1, ["0"], 10), 9);
  });

  void test("accepts the same frame reporting a path again", async () => {
    await report(["0"], 9);
    await report(["0"], 9);
    assert.equal(await framePaths.lookup(TAB, 1, ["0"], 10), 9);
  });

  void test("ignores a report made outside a session", async () => {
    framePaths.end(TAB, 1);
    await report(["0"], 9);
    framePaths.reset(TAB, 1);
    assert.equal(await framePaths.lookup(TAB, 1, ["0"], 10), undefined);
  });

  void test("does not create a session when looking up", async () => {
    framePaths.end(TAB, 1);
    assert.equal(await framePaths.lookup(TAB, 1, [], 10), undefined);
    await report(["0"], 9);
    framePaths.reset(TAB, 1);
    assert.equal(await framePaths.lookup(TAB, 1, ["0"], 10), undefined);
  });

  void test("forgets reports of the previous hint session", async () => {
    await report(["0"], 9);
    framePaths.reset(TAB, 1);
    assert.equal(await framePaths.lookup(TAB, 1, ["0"], 10), undefined);
  });

  void test("routes the empty path to the top frame before the session's table starts", async () => {
    framePaths.forgetTab(TAB);
    await call(
      "AllRectsRequest",
      { id: 4, targetPath: [], viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].options?.frameId, 0);
  });

  void test("a child request made before the session's table starts waits for it", async () => {
    framePaths.forgetTab(TAB);
    const request = call(
      "AllRectsRequest",
      { id: 2, targetPath: ["0"], viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    framePaths.reset(TAB, 2);
    await report(["0"], 9);
    await request;

    assert.equal(sent.length, 1);
    assert.equal(sent[0].options?.frameId, 9);
  });

  void test("a child request of the next session made while the previous table is left waits for its own table", async () => {
    await report(["0"], 5);
    const request = call(
      "AllRectsRequest",
      { id: 2, targetPath: ["0"], viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(sent.length, 0);
    framePaths.reset(TAB, 2);
    await report(["0"], 9);
    await request;

    assert.equal(sent.length, 1);
    assert.equal(sent[0].options?.frameId, 9);
  });

  void test("a request of an ended session is not sent to the next session's frames", async () => {
    framePaths.end(TAB, 1);
    const request = call(
      "AllRectsRequest",
      { id: 1, targetPath: ["0"], viewport: VIEWPORT, offsets: OFFSETS },
      { tab: { id: TAB }, frameId: 0 },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    framePaths.reset(TAB, 2);
    await report(["0"], 9);
    await request;
    await call(
      "AllRectsRequest",
      { id: 1, targetPath: ["0"], viewport: VIEWPORT, offsets: OFFSETS },
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

  void test("empty path from the top frame → BlurRoot to frame 0", async () => {
    await call(
      "BlurUp",
      { path: [], rect: RECT },
      { tab: { id: TAB }, frameId: 0 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "BlurRoot");
    assert.equal(sent[0].options?.frameId, 0);
    assert.deepEqual(sent[0].payload, { rect: RECT });
  });

  void test("empty path from a non-top frame is rejected", async () => {
    await assert.rejects(
      call(
        "BlurUp",
        { path: [], rect: RECT },
        { tab: { id: TAB }, frameId: 3 },
      ),
    );
    assert.equal(sent.length, 0);
  });

  void test("child path → BlurRelay to every frame, addressed to the parent's path", async () => {
    await call(
      "BlurUp",
      { path: ["2", "s1"], rect: RECT },
      { tab: { id: TAB }, frameId: 11 },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "BlurRelay");
    assert.equal(sent[0].options?.frameId, undefined);
    assert.deepEqual(sent[0].payload, {
      targetPath: ["2"],
      childSegment: "s1",
      rect: RECT,
    });
  });
});
