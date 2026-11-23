/* WHY: `_area` is the marker for the active storage area; switching it changes
   every value at once without a per-key change event. */
const AREA_MARKER = "_area";

export type SettingsArea = "local" | "sync";

export async function readActiveArea(): Promise<SettingsArea> {
  const { [AREA_MARKER]: area } = await chrome.storage.local.get(AREA_MARKER);
  return area === "chrome-local" ? "local" : "sync";
}

export async function isRelevantChange(
  changes: Record<string, unknown>,
  areaName: string,
  keys: readonly string[],
  activeArea: () => Promise<SettingsArea> = readActiveArea,
): Promise<boolean> {
  if (areaName === "local" && AREA_MARKER in changes) return true;
  if (!keys.some((k) => k in changes)) return false;
  return areaName === (await activeArea());
}
