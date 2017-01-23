// @flow

import GlobTrie from "glob-trie.js";

export default class BlackList {
  pattern: GlobTrie;

  constructor(text: string) {
    this.pattern = parse(text);
  }
  match(url: string): boolean {
    return this.pattern.collect(url).length !== 0;
  }
}

function parse(text) {
  return text
    .split(/\s*\r?\n\s*/)
    .filter((s) => !(/^#/).test(s)) // filter out comments
    .filter((s) => s)               // filter out empty patterns
    .reduce((gt, s) => { gt.add(s, true); return gt; }, new GlobTrie);
}
