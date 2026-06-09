// A search trie that can efficiently match a string against a large number of
// glob patterns, each carrying an associated payload.
//
// This is a TypeScript reimplementation of the unmaintained `glob-trie.js`
// package (https://github.com/rbranson/glob-trie.js) by Rick Branson, which
// relied on an implicit global assignment that is illegal in strict mode.
//
// Supported pattern syntax:
//
//   *      matches any character 0 to infinity times
//   ?      matches any character exactly once
//   \      escapes *, ?, [ and ]
//   [...]  matches a RegExp-compatible character class once
//   anything else is matched at face value
//

// A compiled sub-expression. A plain string matches that exact character,
// while the symbolic tokens below match wildcards, character classes and the
// end of an expression.
type Sexpr = string;

const STAR = ":*";
const ANY = ":?";
const END = ":E";

class Node<T> {
  readonly children: Node<T>[] = [];
  readonly payloads: T[] = [];
  private matcher: RegExp | null | undefined;

  constructor(
    readonly parent: Node<T> | null = null,
    readonly sexpr: Sexpr | null = null,
  ) {}

  isRoot(): boolean {
    return this.parent == null;
  }

  // Returns a RegExp matching a single character against this node's character
  // class sexpr (e.g. `:[abc]`), or null if this node is not a character class.
  charClassMatcher(): RegExp | null {
    if (this.matcher === undefined) {
      const m = this.sexpr?.match(/^:\[(.*?)\]$/);
      if (m) {
        // Re-escape the guts so they are treated literally inside the class.
        const guts = m[1].replace(/([[\]()*?.\\])/g, "\\$1");
        this.matcher = new RegExp("^[" + guts + "]$");
      } else {
        this.matcher = null;
      }
    }
    return this.matcher;
  }
}

// Parses an expression into an array of valid sexprs.
function compile(expr: string): Sexpr[] {
  const out: Sexpr[] = [];
  let inBracket = false;
  let buf = "";

  for (let i = 0; i < expr.length; i++) {
    const c = expr.charAt(i);

    if (c === "\\") {
      const nextc = expr.charAt(++i);
      if (inBracket) {
        buf += nextc;
      } else {
        out.push(nextc);
      }
    } else if (inBracket) {
      if (c === "]") {
        out.push(":[" + buf + "]");
        inBracket = false;
        buf = "";
      } else {
        buf += c;
      }
    } else {
      switch (c) {
        case "[":
          inBracket = true;
          buf = "";
          break;
        case "]":
          throw new Error(
            "GlobTrie.compile error: stray right bracket encountered.",
          );
        case "*":
          out.push(STAR);
          break;
        case "?":
          out.push(ANY);
          break;
        default:
          out.push(c);
          break;
      }
    }
  }

  out.push(END);
  return out;
}

export default class GlobTrie<T> {
  private readonly root = new Node<T>();

  // Adds a payload to the trie for an expression.
  add(expr: string, payload: T): void {
    let node = this.root;
    for (const sexpr of compile(expr)) {
      let child = node.children.find((c) => c.sexpr === sexpr);
      if (!child) {
        child = new Node<T>(node, sexpr);
        node.children.push(child);
      }
      node = child;
    }
    node.payloads.push(payload);
  }

  // Collects all the payloads found when searching the trie for a string.
  collect(s: string): T[] {
    const ret: T[] = [];
    this.walk(this.root, s, 0, (node) => {
      ret.push(...node.payloads);
    });
    return ret;
  }

  // Recursively walks the trie searching for `s`, calling `f` at each node
  // whose path matches a full prefix of the string up to position `pos`.
  private walk(
    node: Node<T>,
    s: string,
    pos: number,
    f: (node: Node<T>) => void,
  ): void {
    if (node.isRoot()) {
      for (const child of node.children) {
        this.walk(child, s, pos, f);
      }
      return;
    }

    const sexpr = node.sexpr;
    if (sexpr == null) return;

    const c = s.charAt(pos);
    if (
      c.length === 1 &&
      (sexpr === c ||
        sexpr === ANY ||
        (sexpr.charAt(1) === "[" && node.charClassMatcher()?.test(c)))
    ) {
      // Matched a single-char wildcard, exact char, or character class.
      for (const child of node.children) {
        this.walk(child, s, pos + 1, f);
      }
    } else if (sexpr === STAR) {
      // Match any character in the rest of the string, including zero chars.
      for (let si = pos; si <= s.length; si++) {
        for (const child of node.children) {
          this.walk(child, s, si, f);
        }
      }
    } else if (sexpr === END && pos === s.length) {
      // Matched the end of the expression to the end of the string.
      f(node);
    }
  }
}
