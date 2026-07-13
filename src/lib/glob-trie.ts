/**
 * WHY: TypeScript reimplementation of the unmaintained `glob-trie.js` package
 * (https://github.com/rbranson/glob-trie.js) by Rick Branson, which relied on
 * an implicit global assignment that is illegal in strict mode.
 *
 * Supported pattern syntax:
 *
 *   *      matches any character 0 to infinity times
 *   ?      matches any character exactly once
 *   \      escapes *, ?, [ and ]
 *   [...]  matches a RegExp-compatible character class once
 *   anything else is matched at face value
 */

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

  charClassMatcher(): RegExp | null {
    if (this.matcher === undefined) {
      const m = this.sexpr?.match(/^:\[(.*?)\]$/);
      if (m) {
        // WHY: re-escape the guts so they are treated literally inside the class.
        const guts = m[1].replace(/([[\]()*?.\\])/g, "\\$1");
        this.matcher = new RegExp("^[" + guts + "]$");
      } else {
        this.matcher = null;
      }
    }
    return this.matcher;
  }
}

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

  collect(s: string): T[] {
    const ret: T[] = [];
    this.walk(this.root, s, 0, (node) => {
      ret.push(...node.payloads);
    });
    return ret;
  }

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
      for (const child of node.children) {
        this.walk(child, s, pos + 1, f);
      }
    } else if (sexpr === STAR) {
      for (let si = pos; si <= s.length; si++) {
        for (const child of node.children) {
          this.walk(child, s, si, f);
        }
      }
    } else if (sexpr === END && pos === s.length) {
      f(node);
    }
  }
}
