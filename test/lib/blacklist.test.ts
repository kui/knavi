import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { BlackList } from "../../src/lib/blacklist.ts";

const patterns = `https://www.google.co.jp/search
https://twitter.com/*/status/*`;

void describe("BlackList", () => {
  void describe("#match", () => {
    const bl = new BlackList(patterns);
    void test("should return true if any patterns matched", () => {
      assert.deepStrictEqual(
        bl.match("https://twitter.com/k_ui/status/823418931834548226"),
        ["https://twitter.com/*/status/*"],
      );
      assert.deepStrictEqual(bl.match("https://www.google.co.jp/search"), [
        "https://www.google.co.jp/search",
      ]);
    });
    void test("should return false if no patterns matched", () => {
      assert.deepStrictEqual(bl.match("https://twitter.com/k_ui"), []);
      assert.deepStrictEqual(bl.match("https://www.google.co.jp"), []);
    });
  });
});
