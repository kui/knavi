import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SettingsLoader,
  isRelevantChange,
  type RootSettings,
} from "../../src/content-root/settings-loader";

const settings = (hints: string): RootSettings => ({
  css: "",
  hints,
  cycleKey: "Tab",
});

void describe("SettingsLoader", () => {
  void it("drops the result of a load superseded by a later one", async () => {
    const resolvers: ((s: RootSettings) => void)[] = [];
    const applied: string[] = [];
    const loader = new SettingsLoader(
      () => new Promise((resolve) => resolvers.push(resolve)),
      (s) => applied.push(s.hints),
    );

    const first = loader.load();
    const second = loader.load();
    resolvers[1](settings("new"));
    await second;
    resolvers[0](settings("old"));
    await first;

    assert.deepEqual(applied, ["new"]);
  });

  void it("applies each load when they do not overlap", async () => {
    const applied: string[] = [];
    let next = "a";
    const loader = new SettingsLoader(
      () => Promise.resolve(settings(next)),
      (s) => applied.push(s.hints),
    );
    await loader.load();
    next = "b";
    await loader.load();
    assert.deepEqual(applied, ["a", "b"]);
  });
});

void describe("isRelevantChange", () => {
  void it("accepts the settings content-root renders and the area marker", () => {
    for (const key of ["css", "hints", "cycleKey", "_area"]) {
      assert.equal(isRelevantChange({ [key]: {} }), true, key);
    }
  });

  void it("ignores other keys", () => {
    assert.equal(isRelevantChange({ blackList: {} }), false);
  });
});
