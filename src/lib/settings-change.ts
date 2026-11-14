/* WHY: `_area` is the marker for the active storage area; switching it changes
   every value at once without a per-key change event. */
const AREA_MARKER = "_area";

export function isRelevantChange(
  changes: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return AREA_MARKER in changes || keys.some((k) => k in changes);
}
