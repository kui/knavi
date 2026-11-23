import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const framePaths = await import("../../src/background/frame-paths.js");

const TAB = 300;

void describe("frame path lookups that are waiting", () => {
  beforeEach(() => {
    framePaths.end(TAB);
  });

  void test("resolve as soon as the path is reported", async () => {
    framePaths.reset(TAB, 1);
    const pending = framePaths.lookup(TAB, ["3"], 10_000);
    framePaths.report(TAB, ["3"], 7);
    assert.equal(await pending, 7);
  });

  void test("resolve to undefined when a new session starts", async () => {
    framePaths.reset(TAB, 1);
    const pending = framePaths.lookup(TAB, ["3"], 10_000);
    framePaths.reset(TAB, 1);
    assert.equal(await pending, undefined);
  });

  void test("resolve to undefined when the session ends", async () => {
    framePaths.reset(TAB, 1);
    const pending = framePaths.lookup(TAB, ["3"], 10_000);
    framePaths.end(TAB);
    assert.equal(await pending, undefined);
  });

  void test("stay when another session's end arrives", async () => {
    framePaths.reset(TAB, 2);
    framePaths.report(TAB, ["3"], 7);
    const pending = framePaths.lookup(TAB, ["4"], 10_000);
    framePaths.end(TAB, 1);
    framePaths.report(TAB, ["4"], 8);
    assert.equal(await pending, 8);
    assert.equal(await framePaths.lookup(TAB, ["3"], 10), 7);
  });
});
