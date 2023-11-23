module "glob-trie.js" {
  export default class GlobTrie<T> {
    constructor();
    add(pattern: string, value: T): void;
    collect(s: string): string[];
  }
}
