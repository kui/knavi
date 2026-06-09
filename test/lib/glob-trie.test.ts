// Ported from the original `glob-trie.js` test suite
// (https://github.com/rbranson/glob-trie.js/blob/master/test.js).
// The `remove` / `nodeCount` based assertions are omitted because those
// methods are not part of the API used by knavi.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import GlobTrie from "../../src/lib/glob-trie";

const sorted = (a: string[]) => [...a].sort();

void describe("GlobTrie", () => {
  void describe("url patterns", () => {
    const urlTrie = new GlobTrie<string>();

    urlTrie.add("*", "*");
    urlTrie.add("*://example.com/", "*://example.com/");
    urlTrie.add("http://*", "http://*");
    urlTrie.add("http://*.example.com/", "http://*.example.com/");
    urlTrie.add("http://*example.com/", "http://*example.com/");
    urlTrie.add("http://example.com/*", "http://example.com/*");
    urlTrie.add("http://example.com/*/foo", "http://example.com/*/foo");
    urlTrie.add("http://example.com/*/bar", "http://example.com/*/bar");
    urlTrie.add("http://?x?mple.com/*", "http://?x?mple.com/*");
    urlTrie.add("http://*example.????*", "http://*example.????*");
    urlTrie.add("http://*example.???*", "http://*example.???*");
    urlTrie.add("http://*example.??*", "http://*example.??*");
    urlTrie.add("http://example.com/\\?q=*", "http://example.com/\\?q=*");
    urlTrie.add("http://example.com/\\q", "http://example.com/\\q");
    urlTrie.add("http://example.com/\\", "http://example.com/\\");

    void test("http://", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://")),
        sorted(["*", "http://*"]),
      );
    });

    void test("http://www.example.com/", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://www.example.com/")),
        sorted([
          "*",
          "http://*",
          "http://*.example.com/",
          "http://*example.com/",
          "http://*example.????*",
          "http://*example.???*",
          "http://*example.??*",
        ]),
      );
    });

    void test("http://example.com/", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://example.com/")),
        sorted([
          "*",
          "*://example.com/",
          "http://*",
          "http://*example.com/",
          "http://?x?mple.com/*",
          "http://example.com/*",
          "http://*example.????*",
          "http://*example.???*",
          "http://*example.??*",
        ]),
      );
    });

    void test("http://example.com/page.html", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://example.com/page.html")),
        sorted([
          "*",
          "http://*",
          "http://example.com/*",
          "http://?x?mple.com/*",
          "http://*example.????*",
          "http://*example.???*",
          "http://*example.??*",
        ]),
      );
    });

    void test("http://www.nodejs.org/", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://www.nodejs.org/")),
        sorted(["*", "http://*"]),
      );
    });

    void test("ftp://example.com/", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("ftp://example.com/")),
        sorted(["*", "*://example.com/"]),
      );
    });

    void test("http://example.com/?q=books", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://example.com/?q=books")),
        sorted([
          "*",
          "http://*",
          "http://?x?mple.com/*",
          "http://example.com/*",
          "http://example.com/\\?q=*",
          "http://*example.????*",
          "http://*example.???*",
          "http://*example.??*",
        ]),
      );
    });

    void test("http://example.com/bar/foo", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://example.com/bar/foo")),
        sorted([
          "*",
          "http://*",
          "http://?x?mple.com/*",
          "http://example.com/*",
          "http://example.com/*/foo",
          "http://*example.????*",
          "http://*example.???*",
          "http://*example.??*",
        ]),
      );
    });

    void test("http://example.com/bar", () => {
      assert.deepStrictEqual(
        sorted(urlTrie.collect("http://example.com/bar")),
        sorted([
          "*",
          "http://*",
          "http://?x?mple.com/*",
          "http://example.com/*",
          "http://*example.????*",
          "http://*example.???*",
          "http://*example.??*",
        ]),
      );
    });
  });

  void describe("character classes", () => {
    const classTrie = new GlobTrie<string>();

    classTrie.add("[a-zA-Z0-9]", "[a-zA-Z0-9]");
    classTrie.add("[0-9]*", "[0-9]*");
    classTrie.add("*[0-9]", "*[0-9]");
    classTrie.add("*[0-9]*", "*[0-9]*");
    classTrie.add("[\\[\\]\\?\\(\\)\\.\\*\\\\]", "[\\[\\]\\?\\(\\)\\.\\*\\\\]");
    classTrie.add("[^0-9]", "[^0-9]");

    void test("no match", () => {
      assert.deepStrictEqual(
        classTrie.collect("This won't match anything"),
        [],
      );
    });

    void test("0", () => {
      assert.deepStrictEqual(
        sorted(classTrie.collect("0")),
        sorted(["[a-zA-Z0-9]", "[0-9]*", "*[0-9]", "*[0-9]*"]),
      );
    });

    void test("1", () => {
      assert.deepStrictEqual(
        sorted(classTrie.collect("1")),
        sorted(["[a-zA-Z0-9]", "[0-9]*", "*[0-9]", "*[0-9]*"]),
      );
    });

    void test("100", () => {
      assert.deepStrictEqual(
        sorted(classTrie.collect("100")),
        sorted([
          "[0-9]*",
          "*[0-9]",
          "*[0-9]*",
          "*[0-9]*",
          "*[0-9]*", // matched once per character, as in the original
        ]),
      );
    });

    void test("abc1", () => {
      assert.deepStrictEqual(
        sorted(classTrie.collect("abc1")),
        sorted(["*[0-9]", "*[0-9]*"]),
      );
    });

    void test("1abc", () => {
      assert.deepStrictEqual(
        sorted(classTrie.collect("1abc")),
        sorted(["[0-9]*", "*[0-9]*"]),
      );
    });

    void test("a", () => {
      assert.deepStrictEqual(
        sorted(classTrie.collect("a")),
        sorted(["[a-zA-Z0-9]", "[^0-9]"]),
      );
    });

    // Every escaped metacharacter
    for (const c of ["[", "]", "(", ")", ".", "?", "\\"]) {
      void test(`escaped ${c}`, () => {
        assert.deepStrictEqual(
          sorted(classTrie.collect(c)),
          sorted(["[\\[\\]\\?\\(\\)\\.\\*\\\\]", "[^0-9]"]),
        );
      });
    }
  });

  void describe("regression", () => {
    void test("does not match a longer pattern against a shorter string", () => {
      const stupidBugTrie = new GlobTrie<string>();
      stupidBugTrie.add("[0-9][a-z]", "[0-9][a-z]");
      assert.notStrictEqual(stupidBugTrie.collect("00")[0], "[0-9][a-z]");
    });
  });
});
