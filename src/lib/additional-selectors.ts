import JSON5 from "json5";
import GlobTrie from "glob-trie.js";
import { flatMap, reduce } from "./iters.js";

export class AdditionalSelectors {
  private patterns: GlobTrie<string[]>;

  constructor(text: string) {
    this.patterns = parse(text);
  }

  match(url: string) {
    return Array.from(flatMap(this.patterns.collect(url), (a) => a));
  }
}

function parse(text: string): GlobTrie<string[]> {
  const obj = JSON5.parse<Record<string, string[] | string>>(text);
  if (typeof obj !== "object") {
    console.error("Invalid additional selectors", obj);
    return new GlobTrie();
  }
  return reduce(
    Object.entries(obj),
    (gt, [pattern, selectors]) => {
      if (Array.isArray(selectors) && selectors.length >= 1) {
        gt.add(pattern, selectors);
      } else if (typeof selectors === "string") {
        gt.add(pattern, [selectors]);
      } else {
        console.error("Invalid additional selectors", pattern, selectors);
      }
      return gt;
    },
    new GlobTrie(),
  );
}
