import { containsComposed } from "../dom/elements";

export interface DedupeCandidate {
  element: Element;
  actualTarget?: Element;
  rects: RectJSON<"element-border", "root-viewport">[];
  heuristic: boolean;
}

/**
 * Drop a heuristic (`cursor`-based) candidate when a real control with the
 * same rects is its composed ancestor or descendant, since the control is what
 * a real mouse click would hit.
 */
export function dropNestedHeuristicDuplicates<C extends DedupeCandidate>(
  candidates: C[],
): C[] {
  const dropped = new Set<C>();
  for (const group of Map.groupBy(candidates, rectsKey).values()) {
    if (group.length < 2) continue;
    for (const candidate of group) {
      if (!candidate.heuristic) continue;
      if (group.some((other) => supersedes(other, candidate)))
        dropped.add(candidate);
    }
  }
  return candidates.filter((c) => !dropped.has(c));
}

function supersedes(other: DedupeCandidate, heuristic: DedupeCandidate) {
  if (other.heuristic) return false;
  const control = target(other);
  const guess = target(heuristic);
  return containsComposed(guess, control) || containsComposed(control, guess);
}

function target(candidate: DedupeCandidate): Element {
  return candidate.actualTarget ?? candidate.element;
}

function rectsKey({ rects }: DedupeCandidate): string {
  return rects.map((r) => `${r.x},${r.y},${r.width},${r.height}`).join(";");
}
