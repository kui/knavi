import GlobTrie from "glob-trie.js";
import { filter, map, reduce } from "./iters";

export class BlackList {
  private patterns: GlobTrie<string>;

  constructor(text: string) {
    this.patterns = parse(text);
  }

  match(url: string) {
    return this.patterns.collect(url);
  }
}

function parse(text: string) {
  return reduce(
    filter(
      map(text.split("\n"), (s) => s.trim()),
      (s) => !s.startsWith("#") && s.length > 0,
    ),
    (gt, s) => {
      gt.add(s, s);
      return gt;
    },
    new GlobTrie(),
  );
}
