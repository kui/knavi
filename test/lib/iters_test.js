import assert from "assert";
import * as iters from "../../src/lib/iters";

describe("iters", () => {
  describe("#length", () => {
    it("should return the length of a provided iterable", () => {
      assert.equal(iters.length([]), 0);
      assert.equal(iters.length([0]), 1);
      assert.equal(iters.length(["a", "a"]), 2);
    });
  });
});
