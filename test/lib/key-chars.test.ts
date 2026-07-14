import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { keyCodeToChars } from "../../src/lib/key-chars";

void describe("keyCodeToChars", () => {
  void test("maps letter codes to lowercase letters", () => {
    assert.deepStrictEqual(keyCodeToChars("KeyA"), ["a"]);
    assert.deepStrictEqual(keyCodeToChars("KeyZ"), ["z"]);
  });

  void test("maps digit codes to digit characters", () => {
    assert.deepStrictEqual(keyCodeToChars("Digit1"), ["1"]);
    assert.deepStrictEqual(keyCodeToChars("Numpad0"), ["0"]);
  });

  void test("maps punctuation codes across US and JIS layouts", () => {
    // WHY: Semicolon only differs on US (";").
    assert.deepStrictEqual(keyCodeToChars("Semicolon"), [";"]);
    // WHY: Quote yields "'" on US and ":" on JIS.
    assert.deepStrictEqual(keyCodeToChars("Quote"), ["'", ":"]);
    // WHY: BracketLeft yields "[" on US and "@" on JIS.
    assert.deepStrictEqual(keyCodeToChars("BracketLeft"), ["[", "@"]);
  });

  void test("returns empty for unknown / non-typing codes", () => {
    assert.deepStrictEqual(keyCodeToChars("Enter"), []);
    assert.deepStrictEqual(keyCodeToChars("Escape"), []);
    assert.deepStrictEqual(keyCodeToChars("F1"), []);
  });
});
