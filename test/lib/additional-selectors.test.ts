import { AdditionalSelectors } from "../../src/lib/additional-selectors";

describe("AdditionalSelectors", () => {
  describe("#constructor", () => {
    it("should throw an Error if invalid syntax", () => {
      expect(() => {
        new AdditionalSelectors("{");
      }).toThrow();
    });
  });
  describe("#match", () => {
    const additionalSelectors = new AdditionalSelectors(`{
      "http://tumblr.com/*": [
        "a", "b"
      ],
      "http://tumblr.com/dashbord": [
        "c"
      ],
    }`);
    it("should return empty if no match", () => {
      expect(additionalSelectors.match("http://google.com/")).toEqual([]);
    });
    it("should return a flatten array if matched", () => {
      expect(additionalSelectors.match("http://tumblr.com/dashbord")).toEqual([
        "a",
        "b",
        "c",
      ]);
    });
  });
});
