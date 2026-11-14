import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const sentTypes: string[] = [];

(globalThis as Record<string, unknown>).chrome = {
  tabs: {
    sendMessage: (_tabId: number, message: { "@type": string }) => {
      sentTypes.push(message["@type"]);
      return Promise.resolve({ response: undefined });
    },
  },
};

const framePaths = await import("../../src/background/frame-paths.js");
const { router } = await import("../../src/background/hinter.js");
const listener = router.buildListener();

const TAB = 200;

function call(type: string, payload: Record<string, unknown> = {}) {
  return new Promise<void>((resolve, reject) => {
    (
      listener as unknown as (
        m: { "@type": string; [k: string]: unknown },
        s: chrome.runtime.MessageSender,
        r: (arg: { error?: Error }) => void,
      ) => void
    )(
      { "@type": type, ...payload },
      { tab: { id: TAB }, frameId: 0 } as chrome.runtime.MessageSender,
      (arg) => (arg.error ? reject(arg.error) : resolve()),
    );
  });
}

void describe("hint session and the frame path table", () => {
  beforeEach(() => {
    sentTypes.length = 0;
    framePaths.end(TAB);
  });

  void test("AttachHints starts a new session", async () => {
    framePaths.reset(TAB);
    framePaths.report(TAB, ["0"], 9);
    await call("AttachHints");
    assert.equal(await framePaths.lookup(TAB, ["0"], 10), undefined);
  });

  void test("reports made after AttachHints are looked up", async () => {
    await call("AttachHints");
    framePaths.report(TAB, ["0"], 9);
    assert.equal(await framePaths.lookup(TAB, ["0"], 10), 9);
  });

  void test("RemoveHints ends the session and drops reports made after it", async () => {
    await call("AttachHints");
    framePaths.report(TAB, ["0"], 9);
    await call("RemoveHints", { options: {}, execute: false });
    framePaths.report(TAB, ["0"], 9);
    assert.equal(await framePaths.lookup(TAB, ["0"], 10), undefined);
  });
});

void describe("frame path lookups that are waiting", () => {
  beforeEach(() => {
    framePaths.end(TAB);
  });

  void test("resolve to undefined when a new session starts", async () => {
    framePaths.reset(TAB);
    const pending = framePaths.lookup(TAB, ["3"], 10_000);
    framePaths.reset(TAB);
    assert.equal(await pending, undefined);
  });

  void test("resolve to undefined when the session ends", async () => {
    framePaths.reset(TAB);
    const pending = framePaths.lookup(TAB, ["3"], 10_000);
    framePaths.end(TAB);
    assert.equal(await pending, undefined);
  });
});
