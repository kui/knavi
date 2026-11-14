import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRelevantChange } from "../../src/lib/settings-change";

void describe("isRelevantChange", () => {
  void it("accepts a change to one of the given keys", () => {
    assert.equal(isRelevantChange({ hints: {} }, ["hints", "css"]), true);
  });

  void it("accepts the storage area marker whatever the keys are", () => {
    assert.equal(isRelevantChange({ _area: {} }, ["hints"]), true);
  });

  void it("ignores other keys", () => {
    assert.equal(isRelevantChange({ blackList: {} }, ["hints"]), false);
  });
});
