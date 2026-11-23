import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SettingsWatcher } from "../../src/content-all/settings-watcher";

const KEY_SETTINGS = {
  magicKey: "Space",
  blurKey: "",
  hints: "asdfghjkl",
  stickyKey: "",
  actionKey: "",
  cancelKey: "",
  cycleKey: "Tab",
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((r) => setImmediate(r));

/** A `wait` whose timers fire only when the test calls `fire()`. */
class ManualWait {
  private pending: { resolve: () => void; signal: AbortSignal }[] = [];

  readonly wait = (_ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      signal.throwIfAborted();
      this.pending.push({ resolve, signal });
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        {
          once: true,
        },
      );
    });

  async fire() {
    await flush();
    const live = this.pending.filter((p) => !p.signal.aborted);
    this.pending = [];
    for (const p of live) p.resolve();
    await flush();
  }

  get waiting() {
    return this.pending.filter((p) => !p.signal.aborted).length;
  }
}

let hinting: boolean;
let calls: string[];
let matchBlacklist: () => Promise<string[]>;
let timers: ManualWait;
let watcher: SettingsWatcher;

beforeEach(() => {
  hinting = false;
  calls = [];
  matchBlacklist = () => Promise.resolve([]);
  timers = new ManualWait();
  watcher = new SettingsWatcher({
    hinterClient: {
      get isHinting() {
        return hinting;
      },
    },
    keyboardHandler: {
      newBlacklistTicket: () => 1,
      setup: () => calls.push("setup"),
      updateBlacklist: () => calls.push("updateBlacklist"),
    },
    settingsClient: {
      getWithBlacklistMatch: () => {
        calls.push("getWithBlacklistMatch");
        return Promise.resolve([KEY_SETTINGS, []]);
      },
      matchBlacklist: () => {
        calls.push("matchBlacklist");
        return matchBlacklist();
      },
    },
    url: () => "https://example.com/",
    onLoaded: () => calls.push("onLoaded"),
    wait: timers.wait,
    activeArea: () => Promise.resolve("sync"),
  });
});

void describe("SettingsWatcher.handleStorageChange", () => {
  void test("reloads the settings without a separate blacklist refresh when no session runs", async () => {
    const done = watcher.handleStorageChange({ blackList: {} }, "sync");
    await timers.fire();
    await done;
    assert.deepEqual(calls, ["getWithBlacklistMatch", "setup", "onLoaded"]);
  });

  void test("ignores a change in the inactive area", async () => {
    await watcher.handleStorageChange({ hints: {} }, "local");
    assert.equal(timers.waiting, 0);
    assert.deepEqual(calls, []);
  });

  void test("reloads only once for changes within the debounce", async () => {
    const first = watcher.handleStorageChange({ hints: {} }, "sync");
    await flush();
    const second = watcher.handleStorageChange({ magicKey: {} }, "sync");
    await timers.fire();
    await Promise.all([first, second]);
    assert.deepEqual(calls, ["getWithBlacklistMatch", "setup", "onLoaded"]);
  });

  void test("refreshes the blacklist now and waits for the session to end before reloading the other settings", async () => {
    hinting = true;
    const done = watcher.handleStorageChange({ hints: {} }, "sync");
    await timers.fire();
    assert.deepEqual(calls, ["matchBlacklist", "updateBlacklist"]);

    await timers.fire();
    assert.deepEqual(calls, ["matchBlacklist", "updateBlacklist"]);

    hinting = false;
    await timers.fire();
    await done;
    assert.deepEqual(calls, [
      "matchBlacklist",
      "updateBlacklist",
      "getWithBlacklistMatch",
      "setup",
      "onLoaded",
    ]);
  });

  void test("reaches the settings reload when the blacklist refresh fails", async (t) => {
    t.mock.method(console, "error", () => undefined);
    hinting = true;
    matchBlacklist = () => Promise.reject(new Error("storage read failed"));
    const done = watcher.handleStorageChange({ blackList: {} }, "sync");
    await timers.fire();
    hinting = false;
    await timers.fire();
    await done;
    assert.deepEqual(calls, [
      "matchBlacklist",
      "getWithBlacklistMatch",
      "setup",
      "onLoaded",
    ]);
  });

  void test("stops when a newer change arrives during the blacklist refresh", async () => {
    hinting = true;
    const refresh = deferred<string[]>();
    matchBlacklist = () => refresh.promise;
    const first = watcher.handleStorageChange({ blackList: {} }, "sync");
    await timers.fire();
    assert.deepEqual(calls, ["matchBlacklist"]);

    const second = watcher.handleStorageChange({ hints: {} }, "sync");
    await flush();
    hinting = false;
    refresh.resolve([]);
    await first;
    assert.deepEqual(calls, ["matchBlacklist", "updateBlacklist"]);
    assert.equal(timers.waiting, 1, "only the newer change keeps waiting");

    await timers.fire();
    await second;
    assert.deepEqual(calls, [
      "matchBlacklist",
      "updateBlacklist",
      "getWithBlacklistMatch",
      "setup",
      "onLoaded",
    ]);
  });
});
