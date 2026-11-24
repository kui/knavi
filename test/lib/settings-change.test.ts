import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isRelevantChange,
  readActiveArea,
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

void describe("readActiveArea", () => {
  const g = globalThis as Record<string, unknown>;
  const fakeLocal = (stored: Record<string, unknown>) => {
    g.chrome = {
      storage: {
        local: {
          get: (key: string) =>
            Promise.resolve(key in stored ? { [key]: stored[key] } : {}),
        },
      },
    };
  };
  afterEach(() => {
    delete g.chrome;
  });

  void it("is local when the marker is chrome-local", async () => {
    fakeLocal({ _area: "chrome-local" });
    assert.equal(await readActiveArea(), "local");
  });

  void it("is sync when the marker is chrome-sync", async () => {
    fakeLocal({ _area: "chrome-sync" });
    assert.equal(await readActiveArea(), "sync");
  });

  void it("is sync when the marker is not set", async () => {
    fakeLocal({});
    assert.equal(await readActiveArea(), "sync");
  });
});
