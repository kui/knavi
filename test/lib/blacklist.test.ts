import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BlackList,
  parsePatterns,
  togglePattern,
} from "../../src/lib/blacklist";

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

void describe("parsePatterns", () => {
  void test("trims lines and drops empty and comment lines", () => {
    const text = `# comment
  https://example.com/*

\thttps://foo.com/bar
# another comment`;
    assert.deepStrictEqual(parsePatterns(text), [
      "https://example.com/*",
      "https://foo.com/bar",
    ]);
  });

  void test("returns an empty array for empty text", () => {
    assert.deepStrictEqual(parsePatterns(""), []);
  });
});

void describe("togglePattern", () => {
  void test("adds to empty text", () => {
    assert.deepStrictEqual(togglePattern("", "https://example.com/*"), {
      text: "https://example.com/*\n",
      added: true,
    });
  });

  void test("adds a leading newline when text has no trailing newline", () => {
    assert.deepStrictEqual(
      togglePattern("https://a.com/*", "https://b.com/*"),
      { text: "https://a.com/*\nhttps://b.com/*\n", added: true },
    );
  });

  void test("does not duplicate a trailing newline", () => {
    assert.deepStrictEqual(
      togglePattern("https://a.com/*\n", "https://b.com/*"),
      { text: "https://a.com/*\nhttps://b.com/*\n", added: true },
    );
  });

  void test("removes an existing pattern preserving surrounding comments", () => {
    const text = `# keep me
https://a.com/*
https://b.com/*
# trailing comment`;
    assert.deepStrictEqual(togglePattern(text, "https://a.com/*"), {
      text: `# keep me
https://b.com/*
# trailing comment`,
      added: false,
    });
  });

  void test("matches against trimmed lines when removing", () => {
    const text = "  https://a.com/*  \nhttps://b.com/*\n";
    const { added } = togglePattern(text, "https://a.com/*");
    assert.equal(added, false);
  });

  void test("removes all duplicate occurrences in one toggle", () => {
    const text = "https://a.com/*\nhttps://b.com/*\nhttps://a.com/*\n";
    assert.deepStrictEqual(togglePattern(text, "https://a.com/*"), {
      text: "https://b.com/*\n",
      added: false,
    });
  });

  void test("round-trips add then remove back to original", () => {
    const original = "https://a.com/*\n";
    const added = togglePattern(original, "https://b.com/*");
    assert.equal(added.added, true);
    const removed = togglePattern(added.text, "https://b.com/*");
    assert.equal(removed.added, false);
    assert.equal(removed.text, original);
  });
});
