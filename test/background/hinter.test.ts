import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

interface Sent {
  type: string;
  active?: boolean;
  sessionId?: string;
}
const sent: Sent[] = [];
let attachFails = false;

(globalThis as Record<string, unknown>).chrome = {
  tabs: {
    sendMessage: (
      _tabId: number,
      message: { "@type": string; active?: boolean; sessionId?: string },
    ) => {
      sent.push({
        type: message["@type"],
        active: message.active,
        sessionId: message.sessionId,
      });
      if (message["@type"] === "AttachHintsInTab" && attachFails)
        return Promise.reject(new Error("no receiver"));
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

const syncStates = () =>
  sent.filter((m) => m.type === "SyncHintingState").map((m) => m.active);

void describe("hint session and the frame path table", () => {
  beforeEach(() => {
    sent.length = 0;
    attachFails = false;
    framePaths.end(TAB);
  });

  void test("AttachHints starts a session and tells every frame", async () => {
    await call("AttachHints", { sessionId: "s1" });
    assert.deepEqual(syncStates(), [true]);
    framePaths.report(TAB, ["0"], 9);
    assert.equal(await framePaths.lookup(TAB, ["0"], 10), 9);
  });

  void test("AttachHints echoes the session id in the SyncHintingState(true) broadcast", async () => {
    await call("AttachHints", { sessionId: "s1" });
    const sync = sent.find((m) => m.type === "SyncHintingState");
    assert.equal(sync?.sessionId, "s1");
  });

  void test("a second AttachHints drops what the first session reported", async () => {
    await call("AttachHints", { sessionId: "s1" });
    framePaths.report(TAB, ["0"], 9);
    await call("AttachHints", { sessionId: "s2" });
    assert.equal(await framePaths.lookup(TAB, ["0"], 10), undefined);
  });

  void test("RemoveHints ends the session and drops reports made after it", async () => {
    await call("AttachHints", { sessionId: "s1" });
    framePaths.report(TAB, ["0"], 9);
    await call("RemoveHints", { options: {}, execute: false });
    assert.deepEqual(syncStates(), [true, false]);
    framePaths.report(TAB, ["0"], 9);
    assert.equal(await framePaths.lookup(TAB, ["0"], 10), undefined);
  });

  void test("a failed AttachHints ends the session", async () => {
    attachFails = true;
    await assert.rejects(call("AttachHints", { sessionId: "s1" }));
    assert.deepEqual(syncStates(), [true, false]);
    framePaths.report(TAB, ["0"], 9);
    assert.equal(await framePaths.lookup(TAB, ["0"], 10), undefined);
  });
});
