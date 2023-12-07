import { BlackList } from "../../src/lib/blacklist";

const patterns = `https://www.google.co.jp/search
https://twitter.com/*/status/*`;

describe("BlackList", () => {
  describe("#match", () => {
    const bl = new BlackList(patterns);
    test("should return true if any patterns matched", () => {
      expect(
        bl.match("https://twitter.com/k_ui/status/823418931834548226"),
      ).toEqual(["https://twitter.com/*/status/*"]);
      expect(bl.match("https://www.google.co.jp/search")).toEqual([
        "https://www.google.co.jp/search",
      ]);
    });
    test("should return false if no patterns matched", () => {
      expect(bl.match("https://twitter.com/k_ui")).toEqual([]);
      expect(bl.match("https://www.google.co.jp")).toEqual([]);
    });
  });
});
