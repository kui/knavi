// @flow

import GlobTrie from "glob-trie.js";

export default class BlackList {
  patterns: GlobTrie;

  constructor(text: string) {
    this.patterns = parse(text);
  }

  match(url: string): string[] {
    return this.patterns.collect(url);
  }
}

function parse(text) {
  return text
    .split(/\s*\r?\n\s*/)
    .filter((s) => !(/^#/).test(s)) // filter out comments
    .filter((s) => s)               // filter out empty patterns
    .reduce((gt, s) => { gt.add(s, s); return gt; }, new GlobTrie);
}
