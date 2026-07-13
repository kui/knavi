/**
 * WHY: the same physical `code` yields different characters between layouts
 * (US ANSI vs Japanese JIS), so conflict detection over-approximates by
 * listing every candidate a code can produce and treating a hint set
 * containing ANY candidate as a conflict. Hint matching at runtime compares
 * `event.key` (the produced character) against the configured hint letters,
 * while key bindings are stored as `event.code`; this map bridges the two.
 */
const US_CHARS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: " ",
  NumpadDivide: "/",
  NumpadMultiply: "*",
  NumpadSubtract: "-",
  NumpadAdd: "+",
  NumpadDecimal: ".",
};

const JIS_CHARS: Record<string, string> = {
  Equal: "^",
  BracketLeft: "@",
  BracketRight: "[",
  Backslash: "]",
  Quote: ":",
  IntlYen: "¥",
  IntlRo: "\\",
};

export function keyCodeToChars(code: string): string[] {
  const chars = new Set<string>();

  const letter = /^Key([A-Za-z])$/.exec(code);
  if (letter) chars.add(letter[1].toLowerCase());

  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) chars.add(digit[1]);

  if (code in US_CHARS) chars.add(US_CHARS[code]);
  if (code in JIS_CHARS) chars.add(JIS_CHARS[code]);

  return [...chars];
}
