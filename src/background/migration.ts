import type Settings from "../lib/settings";
import { printError } from "../lib/errors";

const BACKDROP_RULE =
  ":host::backdrop { background-color: transparent !important; }";

export interface StorageHandle {
  getSingle(key: "css"): Promise<string | null | undefined>;
  setSingle(key: "css", value: string): Promise<void>;
}

/**
 * WHY: The subset of the settings module the install/update handlers depend on.
 * Passing the module behind this interface keeps the handlers (and tests)
 * decoupled from the rest of the settings API.
 */
interface MigrationSettings {
  getStorage(): Promise<StorageHandle>;
  backfillDefaults(): Promise<void>;
}

export function isOlderThan400(version: string): boolean {
  const [major] = version.split(".").map(Number);
  return major < 4;
}

export async function migrate400(storage: StorageHandle) {
  const css = await storage.getSingle("css");
  if (css == null || css.includes(":host::backdrop")) return;
  const comment =
    "/* Added automatically on migration to v4.0.0. You can remove this if not needed. */";
  await storage.setSingle("css", comment + "\n" + BACKDROP_RULE + "\n\n" + css);
  console.info("[knavi] migration 4.0.0: prepended backdrop rule to css");
}

/**
 * WHY: Thin router: dispatch each onInstalled reason to its handler. Keep the
 * back-fill / migration logic in the handlers below, not here.
 */
export async function onInstalled(
  details: chrome.runtime.InstalledDetails,
  settings: MigrationSettings,
) {
  switch (details.reason) {
    case "install":
      await handleInstall(settings);
      break;
    case "update":
      await handleUpdate(settings, details.previousVersion);
      break;
  }
}

async function handleInstall(settings: MigrationSettings) {
  await settings.backfillDefaults();
}

async function handleUpdate(
  settings: MigrationSettings,
  previousVersion?: string,
) {
  await settings.backfillDefaults();
  if (previousVersion && isOlderThan400(previousVersion)) {
    await migrate400(await settings.getStorage());
  }
}

export function init(settings: typeof Settings) {
  chrome.runtime.onInstalled.addListener((details) => {
    onInstalled(details, settings).catch(printError);
  });
}
