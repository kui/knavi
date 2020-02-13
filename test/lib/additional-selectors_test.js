import assert from "assert";
import AdditionalSelectors from "../../src/lib/additional-selectors";

describe("AdditionalSelectors", () => {
  describe("#constructor", () => {
    it("should throw an Error if invalid syntax", () => {
      assert.throws(() => {
        new AdditionalSelectors("{");
      });
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
      const actual = additionalSelectors.match("http://google.com/");
      assert.deepEqual(actual, []);
    });
    it("should return a flatten array if matched", () => {
      const actual = additionalSelectors.match("http://tumblr.com/dashbord");
      assert.deepEqual(actual, ["a", "b", "c"]);
    });
  });
});