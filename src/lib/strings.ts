export type SingleLetter = string & { length: 1 };

export function isSingleLetter(s: string): s is SingleLetter {
  return s.length === 1;
}
