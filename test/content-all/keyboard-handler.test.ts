import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

interface Sent {
  "@type": string;
  sessionId?: string;
  execute?: boolean;
}
const sent: Sent[] = [];

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: (msg: Sent) => {
      sent.push(msg);
      return Promise.resolve({ response: undefined });
    },
  },
};
(globalThis as Record<string, unknown>).document = { activeElement: null };

const { KeyboardHandlerContentAll } =
  await import("../../src/content-all/keyboard-handler.js");
const { default: HinterClient } =
  await import("../../src/lib/hinter-client.js");

const SETTINGS = {
  magicKey: "Space",
  blurKey: "",
  hints: "asdfghjkl",
  stickyKey: "",
  actionKey: "",
  cancelKey: "",
  cycleKey: "Tab",
};

function makeFakeHinter() {
  return {
    isHinting: false,
    calls: [] as string[],
    ownsSession: false,
    attachHints() {
      this.isHinting = true;
      this.ownsSession = true;
      this.calls.push("attachHints");
      return Promise.resolve();
    },
    hitHint(key: string) {
      this.calls.push(`hitHint:${key}`);
      return Promise.resolve();
    },
    cycleHint() {
      this.calls.push("cycleHint");
      return Promise.resolve();
    },
    removeHints(_modifiers: unknown, execute: boolean) {
      this.isHinting = false;
      this.ownsSession = false;
      this.calls.push(execute ? "removeHints(execute)" : "removeHints(cancel)");
      return Promise.resolve();
    },
  };
}

function keyEvent(type: "keydown" | "keyup", key: string, code: string) {
  return {
    type,
    key,
    code,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  } as KeyboardEvent;
}

void describe("KeyboardHandlerContentAll", () => {
  let hinter: ReturnType<typeof makeFakeHinter>;
  let handler: InstanceType<typeof KeyboardHandlerContentAll>;

  beforeEach(() => {
    hinter = makeFakeHinter();
    handler = new KeyboardHandlerContentAll(null as never, hinter as never);
    handler.setup(SETTINGS, []);
  });

  function startHinting() {
    assert.equal(
      handler.handleKeydown(keyEvent("keydown", " ", "Space")),
      true,
    );
    assert.equal(hinter.isHinting, true);
  }

  void test("hint letter triggers hitHint while hinting", () => {
    startHinting();
    assert.equal(handler.handleKeydown(keyEvent("keydown", "a", "KeyA")), true);
    assert.deepEqual(hinter.calls, ["attachHints", "hitHint:a"]);
  });

  void test("cycle key triggers cycleHint while hinting", () => {
    startHinting();
    assert.equal(
      handler.handleKeydown(keyEvent("keydown", "Tab", "Tab")),
      true,
    );
    assert.deepEqual(hinter.calls, ["attachHints", "cycleHint"]);
  });

  void test("cycle key stuck by a lost keyup is cleared on blur", () => {
    // WHY: simulates Tab moving focus out of the frame, so no keyup arrives.
    handler.handleKeydown(keyEvent("keydown", "Tab", "Tab"));
    handler.handleBlur();

    startHinting();
    handler.handleKeydown(keyEvent("keydown", "a", "KeyA"));
    assert.deepEqual(hinter.calls, ["attachHints", "hitHint:a"]);
  });

  void test("without blur reset, a stuck cycle key swallows hint letters", () => {
    handler.handleKeydown(keyEvent("keydown", "Tab", "Tab"));

    startHinting();
    handler.handleKeydown(keyEvent("keydown", "a", "KeyA"));
    assert.deepEqual(hinter.calls, ["attachHints", "cycleHint"]);
  });

  void test("reloading unchanged settings while the magic key is held keeps the session", () => {
    startHinting();
    handler.setup({ ...SETTINGS }, []);

    handler.handleKeydown(keyEvent("keydown", "a", "KeyA"));
    handler.handleKeyup(keyEvent("keyup", "a", "KeyA"));
    assert.deepEqual(hinter.calls, ["attachHints", "hitHint:a"]);
  });

  void test("a changed magic key takes effect on reload", () => {
    handler.setup({ ...SETTINGS, magicKey: "Shift+Space" }, []);

    handler.handleKeydown(keyEvent("keydown", " ", "Space"));
    assert.deepEqual(hinter.calls, []);
  });

  void test("a blacklist match during a hold session removes hints without executing", () => {
    startHinting();
    handler.updateBlacklist(["example.com"]);

    assert.deepEqual(hinter.calls, ["attachHints", "removeHints(cancel)"]);
    assert.equal(handler.handleKeyup(keyEvent("keyup", " ", "Space")), false);
    assert.deepEqual(hinter.calls, ["attachHints", "removeHints(cancel)"]);
  });

  void test("a blacklist match during a sticky session removes hints without executing", () => {
    handler.setup({ ...SETTINGS, magicKey: "", stickyKey: "Space" }, []);
    startHinting();
    handler.updateBlacklist(["example.com"]);

    assert.deepEqual(hinter.calls, ["attachHints", "removeHints(cancel)"]);
    assert.equal(handler.handleKeyup(keyEvent("keyup", " ", "Space")), false);
    assert.deepEqual(hinter.calls, ["attachHints", "removeHints(cancel)"]);
  });

  void test("a blacklist match does not end a session started by another frame", () => {
    hinter.isHinting = true;
    handler.updateBlacklist(["example.com"]);

    assert.deepEqual(hinter.calls, []);
  });

  void test("a blacklist match while not hinting does nothing", () => {
    handler.updateBlacklist(["example.com"]);
    assert.deepEqual(hinter.calls, []);
  });

  void test("the blacklist still prevents starting a session", () => {
    handler.updateBlacklist(["example.com"]);

    assert.equal(
      handler.handleKeydown(keyEvent("keydown", " ", "Space")),
      false,
    );
    assert.deepEqual(hinter.calls, []);
  });
});

void describe("KeyboardHandlerContentAll with the real HinterClient", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  void test("a late SyncHintingState(true) of the previous session does not stop the magic key release from ending the new one", async () => {
    sent.length = 0;
    const hinter = new HinterClient();
    const handler = new KeyboardHandlerContentAll(null as never, hinter);
    handler.setup(SETTINGS, []);

    handler.handleKeydown(keyEvent("keydown", " ", "Space"));
    await flush();
    const first = sent.find((m) => m["@type"] === "AttachHints")?.sessionId;
    assert.ok(first);
    handler.handleKeyup(keyEvent("keyup", " ", "Space"));
    await flush();

    handler.handleKeydown(keyEvent("keydown", " ", "Space"));
    await flush();
    hinter.syncHinting(true, first);
    sent.length = 0;
    assert.equal(handler.handleKeyup(keyEvent("keyup", " ", "Space")), true);
    await flush();

    assert.deepEqual(
      sent.map((m) => [m["@type"], m.execute]),
      [["RemoveHints", true]],
    );
  });
});
