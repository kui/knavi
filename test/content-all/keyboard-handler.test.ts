import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: () => Promise.resolve({ response: undefined }),
  },
};
(globalThis as Record<string, unknown>).document = { activeElement: null };

const { KeyboardHandlerContentAll } =
  await import("../../src/content-all/keyboard-handler.js");

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
    attachHints() {
      this.isHinting = true;
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
    removeHints() {
      this.isHinting = false;
      this.calls.push("removeHints");
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
});
