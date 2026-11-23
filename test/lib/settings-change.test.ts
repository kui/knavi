import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRelevantChange,
  type SettingsArea,
} from "../../src/lib/settings-change";

const active = (area: SettingsArea) => () => Promise.resolve(area);

void describe("isRelevantChange", () => {
  void it("accepts a change to one of the given keys in the active area", async () => {
    assert.equal(
      await isRelevantChange(
        { hints: {} },
        "sync",
        ["hints", "css"],
        active("sync"),
      ),
      true,
    );
    assert.equal(
      await isRelevantChange(
        { hints: {} },
        "local",
        ["hints"],
        active("local"),
      ),
      true,
    );
  });

  void it("ignores a change to the given keys in the inactive area", async () => {
    assert.equal(
      await isRelevantChange({ hints: {} }, "sync", ["hints"], active("local")),
      false,
    );
    assert.equal(
      await isRelevantChange({ hints: {} }, "local", ["hints"], active("sync")),
      false,
    );
  });

  void it("accepts the storage area marker in local whatever the keys and active area are", async () => {
    assert.equal(
      await isRelevantChange({ _area: {} }, "local", ["hints"], active("sync")),
      true,
    );
  });

  void it("ignores other keys", async () => {
    assert.equal(
      await isRelevantChange(
        { blackList: {} },
        "sync",
        ["hints"],
        active("sync"),
      ),
      false,
    );
  });
});
