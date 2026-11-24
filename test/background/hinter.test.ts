import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

interface Sent {
  type: string;
  active?: boolean;
  sessionId?: number;
}
const sent: Sent[] = [];
let attachFails = false;
let nextSessionId = 1;
let liveSessionId: number | null = null;

(globalThis as Record<string, unknown>).chrome = {
  tabs: {
    sendMessage: (
      _tabId: number,
      message: { "@type": string; active?: boolean; sessionId?: number },
    ) => {
      sent.push({
        type: message["@type"],
        active: message.active,
        sessionId: message.sessionId,
      });
      if (message["@type"] === "AttachHintsInTab") {
        if (attachFails) return Promise.reject(new Error("no receiver"));
        liveSessionId = nextSessionId++;
        return Promise.resolve({ response: { sessionId: liveSessionId } });
      }
      if (message["@type"] === "IsLiveSessionInTab")
        return Promise.resolve({
          response: message.sessionId === liveSessionId,
        });
      if (
        message["@type"] === "RemoveHintsInTab" &&
        message.sessionId === liveSessionId
      )
        liveSessionId = null;
      return Promise.resolve({ response: undefined });
    },
  },
};

const framePaths = await import("../../src/background/frame-paths.js");
const { router } = await import("../../src/background/hinter.js");
const listener = router.buildListener();

const TAB = 200;

function call(type: string, payload: Record<string, unknown> = {}) {
  return new Promise<unknown>((resolve, reject) => {
    (
      listener as unknown as (
        m: { "@type": string; [k: string]: unknown },
        s: chrome.runtime.MessageSender,
        r: (arg: { error?: Error; response?: unknown }) => void,
      ) => void
    )(
      { "@type": type, ...payload },
      { tab: { id: TAB }, frameId: 0 } as chrome.runtime.MessageSender,
      (arg) => (arg.error ? reject(arg.error) : resolve(arg.response)),
    );
  });
}

const syncStates = () =>
  sent.filter((m) => m.type === "SyncHintingState").map((m) => m.active);

void describe("hint session and the frame path table", () => {
  beforeEach(() => {
    sent.length = 0;
    attachFails = false;
    framePaths.forgetTab(TAB);
  });

  void test("AttachHints starts a session and tells every frame", async () => {
    await call("AttachHints");
    assert.deepEqual(syncStates(), [true]);
    framePaths.report(TAB, ["0"], 9);
    assert.equal(
      await framePaths.lookup(TAB, liveSessionId ?? 0, ["0"], 10),
      9,
    );
  });

  void test("AttachHints answers and broadcasts the id content-root assigned, after content-root accepts", async () => {
    const reply = await call("AttachHints");
    assert.deepEqual(
      sent.map((m) => m.type),
      ["AttachHintsInTab", "SyncHintingState"],
    );
    const sync = sent.find((m) => m.type === "SyncHintingState");
    assert.deepEqual(reply, { sessionId: sync?.sessionId });
  });

  void test("a second AttachHints drops what the first session reported", async () => {
    await call("AttachHints");
    framePaths.report(TAB, ["0"], 9);
    await call("AttachHints");
    assert.equal(
      await framePaths.lookup(TAB, liveSessionId ?? 0, ["0"], 10),
      undefined,
    );
  });

  void test("RemoveHints ends the session and drops reports made after it", async () => {
    const { sessionId } = (await call("AttachHints")) as { sessionId: number };
    framePaths.report(TAB, ["0"], 9);
    sent.length = 0;
    await call("RemoveHints", { sessionId, options: {}, execute: false });
    assert.deepEqual(syncStates(), [false]);
    assert.ok(sent.every((m) => m.sessionId === sessionId));
    framePaths.report(TAB, ["0"], 9);
    assert.equal(
      await framePaths.lookup(TAB, liveSessionId ?? 0, ["0"], 10),
      undefined,
    );
  });

  void test("a rejected AttachHints broadcasts nothing", async () => {
    attachFails = true;
    await assert.rejects(call("AttachHints"));
    assert.deepEqual(syncStates(), []);
  });

  void test("a rejected AttachHints keeps the live session's frame paths", async () => {
    await call("AttachHints");
    framePaths.report(TAB, ["0"], 9);
    attachFails = true;
    await assert.rejects(call("AttachHints"));
    assert.equal(
      await framePaths.lookup(TAB, liveSessionId ?? 0, ["0"], 10),
      9,
    );
  });

  void test("RemoveHints of an older session keeps the live session's frame paths", async () => {
    const { sessionId: old } = (await call("AttachHints")) as {
      sessionId: number;
    };
    await call("AttachHints");
    framePaths.report(TAB, ["0"], 9);
    await call("RemoveHints", { sessionId: old, options: {}, execute: false });
    assert.equal(
      await framePaths.lookup(TAB, liveSessionId ?? 0, ["0"], 10),
      9,
    );
  });

  void test("RemoveHints broadcasts false before content-root runs the action", async () => {
    const { sessionId } = (await call("AttachHints")) as { sessionId: number };
    sent.length = 0;
    await call("RemoveHints", { sessionId, options: {}, execute: true });
    assert.deepEqual(
      sent.map((m) => m.type),
      ["IsLiveSessionInTab", "SyncHintingState", "RemoveHintsInTab"],
    );
  });

  void test("RemoveHints of an older session broadcasts nothing", async () => {
    const { sessionId: old } = (await call("AttachHints")) as {
      sessionId: number;
    };
    await call("AttachHints");
    sent.length = 0;
    await call("RemoveHints", { sessionId: old, options: {}, execute: false });
    assert.deepEqual(syncStates(), []);
  });

  void test("a second RemoveHints of the same session broadcasts nothing", async () => {
    const { sessionId } = (await call("AttachHints")) as { sessionId: number };
    await call("RemoveHints", { sessionId, options: {}, execute: false });
    sent.length = 0;
    await call("RemoveHints", { sessionId, options: {}, execute: false });
    assert.deepEqual(
      sent.map((m) => m.type),
      ["IsLiveSessionInTab"],
    );
  });
});
