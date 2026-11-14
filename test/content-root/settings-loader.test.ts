import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SettingsLoader,
  type RootSettings,
} from "../../src/content-root/settings-loader";

const settings = (hints: string): RootSettings => ({
  css: "",
  hints,
  cycleKey: "Tab",
});

interface Deferred {
  resolve(s: RootSettings): void;
  reject(e: Error): void;
}

function deferredLoader() {
  const pending: Deferred[] = [];
  const applied: string[] = [];
  const loader = new SettingsLoader(
    () =>
      new Promise<RootSettings>((resolve, reject) =>
        pending.push({ resolve, reject }),
      ),
    (s) => applied.push(s.hints),
  );
  return { loader, pending, applied };
}

void describe("SettingsLoader", () => {
  void it("does not let an older load overwrite a newer applied one", async () => {
    const { loader, pending, applied } = deferredLoader();
    const first = loader.load();
    const second = loader.load();
    pending[1].resolve(settings("new"));
    await second;
    pending[0].resolve(settings("old"));
    await first;
    assert.deepEqual(applied, ["new"]);
  });

  void it("applies an older load that succeeds when the newer one fails", async () => {
    const { loader, pending, applied } = deferredLoader();
    const first = loader.load();
    const second = loader.load();
    pending[1].reject(new Error("read failed"));
    await assert.rejects(second, /read failed/);
    pending[0].resolve(settings("old"));
    await first;
    assert.deepEqual(applied, ["old"]);
  });

  void it("applies each load when they do not overlap", async () => {
    const { loader, pending, applied } = deferredLoader();
    const first = loader.load();
    pending[0].resolve(settings("a"));
    await first;
    const second = loader.load();
    pending[1].resolve(settings("b"));
    await second;
    assert.deepEqual(applied, ["a", "b"]);
  });
});
