import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  onInstalled,
  type StorageHandle,
} from "../../src/background/migration";

function makeSettingsInit(css: string | null) {
  let stored = css;
  const storage: StorageHandle = {
    getSingle: () => Promise.resolve(stored),
    setSingle: (_key: "css", value: string) => {
      stored = value;
      return Promise.resolve();
    },
  };
  return {
    settingsInit: () => Promise.resolve(storage),
    getStored: () => stored,
  };
}

function makeBackfill() {
  let called = false;
  return {
    backfillDefaults: () => {
      called = true;
      return Promise.resolve();
    },
    wasCalled: () => called,
  };
}

void describe("onInstalled", () => {
  void test("migrates css when upgrading from v3.x", async () => {
    const { settingsInit, getStored } = makeSettingsInit(
      ".hint { color: red; }",
    );
    const { backfillDefaults, wasCalled } = makeBackfill();
    onInstalled(
      { reason: "update", previousVersion: "3.2.0" },
      settingsInit,
      backfillDefaults,
    );
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(wasCalled());
    assert.ok(getStored()!.includes(":host::backdrop"));
  });

  void test("runs backfill on fresh install", async () => {
    const { settingsInit } = makeSettingsInit(".hint {}");
    const { backfillDefaults, wasCalled } = makeBackfill();
    onInstalled({ reason: "install" }, settingsInit, backfillDefaults);
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(wasCalled());
  });

  void test("runs backfill but skips migration when updating from v4.x", async () => {
    const { settingsInit, getStored } = makeSettingsInit(".hint {}");
    const { backfillDefaults, wasCalled } = makeBackfill();
    onInstalled(
      { reason: "update", previousVersion: "4.0.0" },
      settingsInit,
      backfillDefaults,
    );
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(wasCalled());
    assert.equal(getStored(), ".hint {}");
  });

  void test("does nothing when previousVersion is absent", async () => {
    const { settingsInit, getStored } = makeSettingsInit(".hint {}");
    const { backfillDefaults, wasCalled } = makeBackfill();
    onInstalled({ reason: "update" }, settingsInit, backfillDefaults);
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(!wasCalled());
    assert.equal(getStored(), ".hint {}");
  });
});
