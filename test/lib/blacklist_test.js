// @flow

import assert from "assert";
import BlackList from "../../src/lib/blacklist";

const patterns = `https://www.google.co.jp/search
https://twitter.com/*/status/*`;

describe("BlackList", () => {
  describe("#match", () => {
    const bl = new BlackList(patterns);
    it("should return true if any patterns matched", () => {
      console.log("https://twitter.com/k_ui/status/823418931834548226");
      assert(bl.match("https://twitter.com/k_ui/status/823418931834548226"));
      console.log("https://www.google.co.jp/search");
      assert(bl.match("https://www.google.co.jp/search"));
    });
    it("should return false if no patterns matched", () => {
      assert.equal(bl.match("https://twitter.com/k_ui"), false);
      assert.equal(bl.match("https://www.google.co.jp"), false);
    });
  });
});
