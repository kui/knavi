import * as iters from "../../src/lib/iters.ts";

describe("length", () => {
  it("should return the length of a provided iterable", () => {
    expect(iters.length([])).toBe(0);
    expect(iters.length([0])).toBe(1);
    expect(iters.length(["a", "a"])).toBe(2);
  });
});

describe("head", () => {
  it("should return the first nth element of a provided iterable", () => {
    expect([...iters.head([], 1)]).toEqual([]);
    expect([...iters.head([0], 1)]).toEqual([0]);
    expect([...iters.head([0, 1], 1)]).toEqual([0]);
    expect([...iters.head([0, 1], 2)]).toEqual([0, 1]);
  });
});
