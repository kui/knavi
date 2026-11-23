import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeKeyConflicts } from "../../src/lib/key-conflicts";

void describe("computeKeyConflicts", () => {
  void test("reports no problem for valid Hint Letters", () => {
    const r = computeKeyConflicts({ hints: "asdf" });
    assert.equal(r.hintsError, null);
    assert.equal(r.invalid.has("hints"), false);
  });

  void test("marks empty Hint Letters invalid", () => {
    const r = computeKeyConflicts({ hints: "" });
    assert.match(r.hintsError ?? "", /empty/);
    assert.equal(r.invalid.has("hints"), true);
    assert.deepEqual(r.messages, [r.hintsError]);
  });

  void test("marks a single Hint Letter invalid", () => {
    const r = computeKeyConflicts({ hints: "a" });
    assert.match(r.hintsError ?? "", /at least two/);
    assert.equal(r.invalid.has("hints"), true);
  });

  void test("keeps key conflicts apart from the Hint Letters error", () => {
    const r = computeKeyConflicts({
      hints: "asdf",
      magicKey: "KeyA",
    });
    assert.equal(r.hintsError, null);
    assert.equal(r.invalid.has("hints"), true);
  });
});
