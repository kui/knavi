// @flow

import GlobTrie from "glob-trie.js";

export default class BlackList {
  pattern: GlobTrie;

  constructor(text: string) {
    this.pattern = parse(text);
  }
  match(url: string): string[] {
    return this.pattern.collect(url);
  }
}

function parse(text) {
  return text
    .split(/\s*\r?\n\s*/)
    .filter((s) => !(/^#/).test(s)) // filter out comments
    .filter((s) => s)               // filter out empty patterns
    .reduce((gt, s) => { gt.add(s, s); return gt; }, new GlobTrie);
}
