import assert from "node:assert";
import * as iters from "../../src/lib/iters.js";

describe("iters", () => {
  describe("#length", () => {
    it("should return the length of a provided iterable", () => {
      assert.equal(iters.length([]), 0);
      assert.equal(iters.length([0]), 1);
      assert.equal(iters.length(["a", "a"]), 2);
    });
  });
});
