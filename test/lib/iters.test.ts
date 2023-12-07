import * as iters from "../../src/lib/iters.ts";

describe("length", () => {
  test("should return the length of a provided iterable", () => {
    expect(iters.length([])).toBe(0);
    expect(iters.length([0])).toBe(1);
    expect(iters.length(["a", "a"])).toBe(2);
  });
});
