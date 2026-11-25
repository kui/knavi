import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateHintLetters } from "../../src/lib/hint-letters";

void describe("validateHintLetters", () => {
  void test("accepts the default letters", () => {
    assert.equal(validateHintLetters("asdfghjkl"), null);
  });

  void test("accepts two distinct letters", () => {
    assert.equal(validateHintLetters("ab"), null);
  });

  void test("rejects an empty value", () => {
    assert.match(validateHintLetters("") ?? "", /empty/);
  });

  void test("rejects a single letter", () => {
    assert.match(validateHintLetters("a") ?? "", /at least two/);
  });

  void test("rejects whitespace, including a whitespace-only value", () => {
    assert.match(validateHintLetters("   ") ?? "", /whitespace/);
    assert.match(validateHintLetters("a b") ?? "", /whitespace/);
  });

  void test("rejects a repeated letter regardless of case", () => {
    assert.match(validateHintLetters("aba") ?? "", /twice/);
    assert.match(validateHintLetters("aA") ?? "", /twice/);
  });
});

void describe("validateHintLetters (non-BMP)", () => {
  void test("rejects a character outside the Basic Multilingual Plane", () => {
    assert.match(validateHintLetters("a😀") ?? "", /Basic Multilingual/);
  });
});
