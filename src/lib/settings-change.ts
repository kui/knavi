/* WHY: `_area` is the marker for the active storage area; switching it changes
   every value at once without a per-key change event. */
export const AREA_MARKER = "_area";
const LOCAL_AREA_VALUE = "chrome-local";

export type SettingsArea = "local" | "sync";

export async function readActiveArea(): Promise<SettingsArea> {
  const { [AREA_MARKER]: area } = await chrome.storage.local.get(AREA_MARKER);
  return area === LOCAL_AREA_VALUE ? "local" : "sync";
}

export async function isRelevantChange(
  changes: Record<string, unknown>,
  areaName: string,
  keys: readonly string[],
  activeArea: () => Promise<SettingsArea>,
): Promise<boolean> {
  if (areaName === "local" && AREA_MARKER in changes) return true;
  if (!keys.some((k) => k in changes)) return false;
  return areaName === (await activeArea());
}
