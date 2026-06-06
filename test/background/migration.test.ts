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

void describe("onInstalled", () => {
  void test("migrates css when upgrading from v3.x", async () => {
    const { settingsInit, getStored } = makeSettingsInit(
      ".hint { color: red; }",
    );
    onInstalled({ reason: "update", previousVersion: "3.2.0" }, settingsInit);
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(getStored()!.includes(":host::backdrop"));
  });

  void test("does nothing on fresh install (reason=install)", async () => {
    const { settingsInit, getStored } = makeSettingsInit(".hint {}");
    onInstalled({ reason: "install" }, settingsInit);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(getStored(), ".hint {}");
  });

  void test("does nothing when updating from v4.x", async () => {
    const { settingsInit, getStored } = makeSettingsInit(".hint {}");
    onInstalled({ reason: "update", previousVersion: "4.0.0" }, settingsInit);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(getStored(), ".hint {}");
  });

  void test("does nothing when previousVersion is absent", async () => {
    const { settingsInit, getStored } = makeSettingsInit(".hint {}");
    onInstalled({ reason: "update" }, settingsInit);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(getStored(), ".hint {}");
  });
});
