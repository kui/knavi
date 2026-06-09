import GlobTrie from "./glob-trie";

export class BlackList {
  private patterns: GlobTrie<string>;

  constructor(text: string) {
    const gt = new GlobTrie<string>();
    for (const p of parsePatterns(text)) gt.add(p, p);
    this.patterns = gt;
  }

  match(url: string) {
    return this.patterns.collect(url);
  }
}

/** Returns the normalized, non-comment, non-empty pattern lines. */
export function parsePatterns(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}

/**
 * Toggle a pattern in the blacklist text while preserving comments and
 * blank lines. The pattern is matched against trimmed lines.
 */
export function togglePattern(
  text: string,
  pattern: string,
): { text: string; added: boolean } {
  const target = pattern.trim();
  const lines = text.split("\n");
  const kept = lines.filter((line) => line.trim() !== target);
  if (kept.length !== lines.length) {
    return { text: kept.join("\n"), added: false };
  }
  const needsLeadingNewline = text.length > 0 && !text.endsWith("\n");
  return {
    text: text + (needsLeadingNewline ? "\n" : "") + target + "\n",
    added: true,
  };
}
