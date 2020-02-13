import JSON5 from "json5";
import GlobTrie from "glob-trie.js";
import { flatMap } from "./iters";

export default class AdditionalSelectors {

  constructor(text) {
    this.patterns = parse(text);
  }

  match(url) {
    return Array.from(flatMap(this.patterns.collect(url), a => a));
  }
}

function parse(text) {
  const obj = JSON5.parse(text);
  if (!obj) return new GlobTrie();
  return Object.keys(obj).reduce((gt, pattern) => {
    const selectors = obj[pattern];
    if (Array.isArray(selectors) && selectors.length >= 1) {
      gt.add(pattern, selectors);
    } else if (typeof selectors === "string") {
      // ignore "String" object
      gt.add(pattern, [selectors]);
    }
    return gt;
  }, new GlobTrie());
}