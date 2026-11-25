import { keyCodeToChars } from "./key-chars";
import { validateHintLetters } from "./hint-letters";

/* WHY: "magicKey" is the legacy storage key; see src/types/settings.d.ts for why
   the UI label diverges from it. */
export const KEY_LABELS: Record<string, string> = {
  magicKey: "Peek Key",
  stickyKey: "Sticky Key",
  blurKey: "Blur Key",
  actionKey: "Action Key",
  cancelKey: "Cancel Key",
  cycleKey: "Cycle Key",
  hints: "Hint Letters",
};

/* WHY: Key-pattern pairs that must not be bound to the same key.

   Keys are split by the phase in which they fire:
     - while NOT hinting: Peek Key, Sticky Key, Blur Key
     - while hinting:     Action Key, Cancel Key, hint letters
       (the Peek Key is also held throughout a hold session, so it overlaps
        the hinting phase too)
   Keys that only ever fire in different phases can safely share a binding.
   Hence Blur Key may share with Action/Cancel/hints, and Sticky Key may share
   with Action/Cancel/hints. */
const KEY_PAIR_CONFLICTS: [string, string][] = [
  ["magicKey", "stickyKey"],
  ["magicKey", "blurKey"],
  ["magicKey", "actionKey"],
  ["magicKey", "cancelKey"],
  ["stickyKey", "blurKey"],
  ["actionKey", "cancelKey"],
];

/* WHY: Key patterns that must not coincide with a hint letter: only keys that fire
   during the hinting phase. (Sticky Key and Blur Key fire only while not
   hinting, so they are excluded.) */
const HINTS_VS_KEYS = ["magicKey", "actionKey", "cancelKey", "cycleKey"];

/** Normalize a key-input pattern string (e.g. "Ctrl + KeyA") for comparison. */
function normalizeKeyPattern(value: string): string {
  return value
    .split("+")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" + ");
}

/**
 * Return the hint letter that a bare single-key pattern (no modifiers/history)
 * would type, or null. Covers letters, digits, and punctuation across common
 * keyboard layouts via `keyCodeToChars`.
 */
function conflictingHintChar(value: string, hints: string): string | null {
  const n = normalizeKeyPattern(value);
  if (n === "" || n.includes(" + ")) return null;
  return keyCodeToChars(n).find((c) => hints.includes(c.toLowerCase())) ?? null;
}

export function computeKeyConflicts(values: Record<string, string>): {
  messages: string[];
  invalid: Set<string>;
  hintsError: string | null;
} {
  const messages: string[] = [];
  const invalid = new Set<string>();

  for (const [a, b] of KEY_PAIR_CONFLICTS) {
    const va = normalizeKeyPattern(values[a] ?? "");
    const vb = normalizeKeyPattern(values[b] ?? "");
    if (va !== "" && va === vb) {
      messages.push(
        `${KEY_LABELS[a]} and ${KEY_LABELS[b]} are both bound to "${va}".`,
      );
      invalid.add(a);
      invalid.add(b);
    }
  }

  const hintsError = validateHintLetters(values.hints ?? "");
  if (hintsError) {
    messages.push(hintsError);
    invalid.add("hints");
  }

  const hints = (values.hints ?? "").toLowerCase();
  for (const name of HINTS_VS_KEYS) {
    const ch = conflictingHintChar(values[name] ?? "", hints);
    if (ch) {
      messages.push(`${KEY_LABELS[name]} ("${ch}") is also a Hint Letter.`);
      invalid.add(name);
      invalid.add("hints");
    }
  }

  return { messages, invalid, hintsError };
}
