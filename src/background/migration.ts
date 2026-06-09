import type Settings from "../lib/settings";
import { printError } from "../lib/errors";

const BACKDROP_RULE =
  ":host::backdrop { background-color: transparent !important; }";

export interface StorageHandle {
  getSingle(key: "css"): Promise<string | null | undefined>;
  setSingle(key: "css", value: string): Promise<void>;
}

type SettingsInit = () => Promise<StorageHandle>;
type BackfillDefaults = () => Promise<void>;

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

export function onInstalled(
  { reason, previousVersion }: chrome.runtime.InstalledDetails,
  settingsInit: SettingsInit,
  backfillDefaults: BackfillDefaults,
) {
  if (reason === "install") {
    backfillDefaults().catch(printError);
    return;
  }

  if (reason !== "update" || !previousVersion) return;

  const chain = backfillDefaults();
  if (isOlderThan400(previousVersion)) {
    chain
      .then(() => settingsInit())
      .then((storage) => migrate400(storage))
      .catch(printError);
  } else {
    chain.catch(printError);
  }
}

export function init(settings: typeof Settings) {
  chrome.runtime.onInstalled.addListener((details) =>
    onInstalled(
      details,
      settings.init.bind(settings),
      settings.backfillDefaults.bind(settings),
    ),
  );
}
