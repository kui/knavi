import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

const g = globalThis as Record<string, unknown>;
const stores = {
  sync: { blackList: "https://sync.example/*" } as Record<string, unknown>,
  local: {
    _area: "chrome-sync",
    blackList: "https://local.example/*",
  } as Record<string, unknown>,
};
let icons: { tabId: number; path: Record<number, string> }[] = [];

function area(name: "sync" | "local") {
  return {
    get: (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in stores[name]) out[k] = stores[name][k];
      return Promise.resolve(out);
    },
    QUOTA_BYTES: 0,
  };
}

function installChrome() {
  g.chrome = {
    storage: { sync: area("sync"), local: area("local") },
    tabs: {
      query: () =>
        Promise.resolve([{ id: 1, url: "https://local.example/page" }]),
    },
    action: {
      setIcon: (d: (typeof icons)[number], cb: () => void) => {
        icons.push(d);
        cb();
      },
    },
    runtime: {},
  };
}

installChrome();
const actionIcon = await import("../../src/background/action-icon");
const settings = (await import("../../src/lib/settings")).default;

const lastIsDisabled = () => icons.at(-1)!.path[16].includes("disabled");

void describe("action icon storage area", () => {
  beforeEach(async () => {
    icons = [];
    stores.local._area = "chrome-sync";
    installChrome();
    await settings.getStorage(true);
    // WHY: fills the cache with the sync blacklist.
    await actionIcon.handleStorageChange(
      { blackList: { newValue: "" } },
      "sync",
    );
  });
  afterEach(() => {
    icons = [];
  });

  void it("shows the sync blacklist state while sync is active", () => {
    assert.equal(lastIsDisabled(), false);
  });

  void it("reads the new area's blacklist after an _area change, with the settings listener not run", async () => {
    stores.local._area = "chrome-local";
    await actionIcon.handleStorageChange(
      { _area: { newValue: "chrome-local" } },
      "local",
    );
    assert.equal(lastIsDisabled(), true);
  });

  void it("does not refresh for a blackList write to the inactive area", async () => {
    icons = [];
    stores.local.blackList = "https://elsewhere.example/*";
    await actionIcon.handleStorageChange(
      { blackList: { newValue: "" } },
      "local",
    );
    assert.equal(icons.length, 0);
  });

  void it("refreshes for a blackList write to the active area", async () => {
    stores.sync.blackList = "https://sync.example/*\nhttps://local.example/*";
    await actionIcon.handleStorageChange(
      { blackList: { newValue: "" } },
      "sync",
    );
    assert.equal(lastIsDisabled(), true);
  });
});
