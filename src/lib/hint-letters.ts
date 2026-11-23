/**
 * Return why `hints` cannot label hints, or null if it can.
 *
 * With a single letter, a hint is a prefix of the next one ("a", "aa"), so
 * typing it never selects one target. A repeated letter yields two hints with
 * the same label. Whitespace cannot be typed as a hint letter.
 */
export function validateHintLetters(hints: string): string | null {
  const chars = [...hints];
  if (chars.length === 0) return "Hint Letters must not be empty.";
  if (chars.some((c) => /\s/u.test(c)))
    return "Hint Letters must not contain whitespace.";
  const distinct = new Set(chars.map((c) => c.toLowerCase()));
  if (distinct.size < chars.length)
    return "Hint Letters must not contain the same letter twice.";
  if (chars.length < 2) return "Hint Letters need at least two letters.";
  return null;
}
