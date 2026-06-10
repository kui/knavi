import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  onInstalled,
  type StorageHandle,
} from "../../src/background/migration";

function makeSettings(css: string | null) {
  let stored = css;
  let backfilled = false;
  const storage: StorageHandle = {
    getSingle: () => Promise.resolve(stored),
    setSingle: (_key: "css", value: string) => {
      stored = value;
      return Promise.resolve();
    },
  };
  return {
    settings: {
      init: () => Promise.resolve(storage),
      backfillDefaults: () => {
        backfilled = true;
        return Promise.resolve();
      },
    },
    getStored: () => stored,
    wasBackfilled: () => backfilled,
  };
}

void describe("onInstalled", () => {
  void test("backfills and migrates css when upgrading from v3.x", async () => {
    const { settings, getStored, wasBackfilled } = makeSettings(
      ".hint { color: red; }",
    );
    await onInstalled({ reason: "update", previousVersion: "3.2.0" }, settings);

    assert.ok(wasBackfilled());
    assert.ok(getStored()!.includes(":host::backdrop"));
  });

  void test("backfills on fresh install without migrating", async () => {
    const { settings, getStored, wasBackfilled } = makeSettings(".hint {}");
    await onInstalled({ reason: "install" }, settings);

    assert.ok(wasBackfilled());
    assert.equal(getStored(), ".hint {}");
  });

  void test("backfills but skips migration when updating from v4.x", async () => {
    const { settings, getStored, wasBackfilled } = makeSettings(".hint {}");
    await onInstalled({ reason: "update", previousVersion: "4.0.0" }, settings);

    assert.ok(wasBackfilled());
    assert.equal(getStored(), ".hint {}");
  });

  void test("backfills but skips migration when previousVersion is absent", async () => {
    const { settings, getStored, wasBackfilled } = makeSettings(".hint {}");
    await onInstalled({ reason: "update" }, settings);

    assert.ok(wasBackfilled());
    assert.equal(getStored(), ".hint {}");
  });
});
