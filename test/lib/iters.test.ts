import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as iters from "../../src/lib/iters.ts";

void describe("length", () => {
  void it("should return the length of a provided iterable", () => {
    assert.strictEqual(iters.length([]), 0);
    assert.strictEqual(iters.length([0]), 1);
    assert.strictEqual(iters.length(["a", "a"]), 2);
  });
});

void describe("head", () => {
  void it("should return the first nth element of a provided iterable", () => {
    assert.deepStrictEqual([...iters.head([], 1)], []);
    assert.deepStrictEqual([...iters.head([0], 1)], [0]);
    assert.deepStrictEqual([...iters.head([0, 1], 1)], [0]);
    assert.deepStrictEqual([...iters.head([0, 1], 2)], [0, 1]);
  });
});
