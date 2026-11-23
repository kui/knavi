/**
 * Return why `hints` cannot label hints, or null if it can.
 *
 * With a single letter, a hint is a prefix of the next one ("a", "aa"), so
 * typing it never selects one target. A repeated letter yields two hints with
 * the same label; letters that differ only in case count as repeated because
 * the default CSS shows hints in uppercase. Whitespace cannot be typed as a
 * hint letter, and neither can a character outside the Basic Multilingual
 * Plane, because the keyboard handler only accepts keys whose `key` has a
 * UTF-16 length of 1.
 */
export function validateHintLetters(hints: string): string | null {
  const chars = [...hints];
  if (chars.length === 0) return "Hint Letters must not be empty.";
  if (chars.some((c) => /\s/u.test(c)))
    return "Hint Letters must not contain whitespace.";
  if (chars.some((c) => c.length !== 1))
    return "Hint Letters must not contain characters outside the Basic Multilingual Plane.";
  const distinct = new Set(chars.map((c) => c.toLowerCase()));
  if (distinct.size < chars.length)
    return "Hint Letters must not contain the same letter twice.";
  if (chars.length < 2) return "Hint Letters need at least two letters.";
  return null;
}
