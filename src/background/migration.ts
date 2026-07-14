import type Settings from "../lib/settings";
import { printError } from "../lib/errors";

const BACKDROP_RULE =
  ":host::backdrop { background-color: transparent !important; }";

const CYCLE_BADGE_RULES = `.hint::before {
  content: attr(data-cycle-key) " +" attr(data-cycle-count);
  text-transform: none;
  font-size: 50%;
  position: absolute;
  background-color: #333;
  color: white;
  border: #ccc 1px solid;
  padding: 3px;
  border-radius: 4px;
  line-height: 1em;
  transition: 200ms;
  bottom: 0px;
  opacity: 0;
}
.hint[data-state="hit"][data-cycle-key]::before {
  transition-delay: 200ms;
  bottom: calc(100% + 4px);
  opacity: 1;
}`;

export interface StorageHandle {
  getSingle(key: "css"): Promise<string | null | undefined>;
  setSingle(key: "css", value: string): Promise<void>;
}

/**
 * The subset of the settings module the install/update handlers depend on.
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

export function isOlderThan420(version: string): boolean {
  const [major, minor] = version.split(".").map(Number);
  return major < 4 || (major === 4 && minor < 2);
}

export async function migrate400(storage: StorageHandle) {
  const css = await storage.getSingle("css");
  if (css == null || css.includes(":host::backdrop")) return;
  const comment =
    "/* Added automatically on migration to v4.0.0. You can remove this if not needed. */";
  await storage.setSingle("css", comment + "\n" + BACKDROP_RULE + "\n\n" + css);
  console.info("[knavi] migration 4.0.0: prepended backdrop rule to css");
}

export async function migrate420(storage: StorageHandle) {
  const css = await storage.getSingle("css");
  if (css == null || css.includes("data-cycle-key")) return;
  const comment =
    "/* Added automatically on migration to v4.2.0. You can remove this if not needed. */";
  await storage.setSingle(
    "css",
    comment + "\n" + CYCLE_BADGE_RULES + "\n\n" + css,
  );
  console.info("[knavi] migration 4.2.0: prepended cycle-badge rules to css");
}

/**
 * Thin router: dispatch each onInstalled reason to its handler. Keep the
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
  if (!previousVersion) return;
  const storage = await settings.getStorage();
  if (isOlderThan400(previousVersion)) await migrate400(storage);
  if (isOlderThan420(previousVersion)) await migrate420(storage);
}

export function init(settings: typeof Settings) {
  chrome.runtime.onInstalled.addListener((details) => {
    onInstalled(details, settings).catch(printError);
  });
}
