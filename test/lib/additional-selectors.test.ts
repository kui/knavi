import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AdditionalSelectors } from "../../src/lib/additional-selectors";

void describe("AdditionalSelectors", () => {
  void describe("#constructor", () => {
    void it("should throw an Error if invalid syntax", () => {
      assert.throws(() => {
        new AdditionalSelectors("{");
      });
    });
  });
  void describe("#match", () => {
    const additionalSelectors = new AdditionalSelectors(`{
      "http://tumblr.com/*": [
        "a", "b"
      ],
      "http://tumblr.com/dashbord": [
        "c"
      ],
    }`);
    void it("should return empty if no match", () => {
      assert.deepStrictEqual(
        additionalSelectors.match("http://google.com/"),
        [],
      );
    });
    void it("should return a flatten array if matched", () => {
      assert.deepStrictEqual(
        additionalSelectors.match("http://tumblr.com/dashbord"),
        ["a", "b", "c"],
      );
    });
  });
});
