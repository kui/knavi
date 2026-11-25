import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const framePaths = await import("../../src/background/frame-paths.js");

const TAB = 300;

/** The settled value, or "pending" if it does not settle within 50 ms. */
function soon<T>(promise: Promise<T>): Promise<T | "pending"> {
  return Promise.race([
    promise,
    new Promise<"pending">((resolve) => setTimeout(resolve, 50, "pending")),
  ]);
}

void describe("frame path lookups that are waiting", () => {
  beforeEach(() => {
    framePaths.forgetTab(TAB);
  });

  void test("resolve as soon as the path is reported", async () => {
    framePaths.reset(TAB, 1);
    const pending = framePaths.lookup(TAB, 1, ["3"], 10_000);
    framePaths.report(TAB, ["3"], 7);
    assert.equal(await pending, 7);
  });

  void test("resolve to undefined when a new session starts", async () => {
    framePaths.reset(TAB, 1);
    const pending = framePaths.lookup(TAB, 1, ["3"], 10_000);
    framePaths.reset(TAB, 1);
    assert.equal(await pending, undefined);
  });

  void test("resolve to undefined when the session ends", async () => {
    framePaths.reset(TAB, 1);
    const pending = framePaths.lookup(TAB, 1, ["3"], 10_000);
    framePaths.end(TAB, 1);
    assert.equal(await pending, undefined);
  });

  void test("stay when another session's end arrives", async () => {
    framePaths.reset(TAB, 2);
    framePaths.report(TAB, ["3"], 7);
    const pending = framePaths.lookup(TAB, 2, ["4"], 10_000);
    framePaths.end(TAB, 1);
    framePaths.report(TAB, ["4"], 8);
    assert.equal(await pending, 8);
    assert.equal(await framePaths.lookup(TAB, 2, ["3"], 10), 7);
  });

  void test("resolve to undefined at once when the tab is closed, and the table is gone", async () => {
    framePaths.reset(TAB, 1);
    framePaths.report(TAB, ["0"], 9);
    const pending = framePaths.lookup(TAB, 1, ["3"], 10_000);
    const early = framePaths.lookup(TAB + 1, 1, ["3"], 10_000);
    framePaths.forgetTab(TAB);
    framePaths.forgetTab(TAB + 1);
    assert.equal(await soon(pending), undefined);
    assert.equal(await soon(early), undefined);
    assert.equal(await framePaths.lookup(TAB, 1, ["0"], 10), undefined);
  });

  void test("of a session whose table has not started all resolve after its reset", async () => {
    const first = framePaths.lookup(TAB, 2, ["1"], 10_000);
    const second = framePaths.lookup(TAB, 2, ["2"], 10_000);
    const other = framePaths.lookup(TAB, 3, ["1"], 10_000);
    framePaths.reset(TAB, 2);
    assert.equal(await soon(other), undefined);
    framePaths.report(TAB, ["1"], 5);
    framePaths.report(TAB, ["2"], 6);
    assert.equal(await soon(first), 5);
    assert.equal(await soon(second), 6);
  });

  void test("of an ended session resolve to undefined at once", async () => {
    framePaths.reset(TAB, 2);
    framePaths.report(TAB, ["0"], 9);
    assert.equal(
      await soon(framePaths.lookup(TAB, 1, ["0"], 10_000)),
      undefined,
    );
  });
});
