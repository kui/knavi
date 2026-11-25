import type settingsClient from "../lib/settings-client";
import type { KeyboardHandlerContentAll } from "./keyboard-handler";
import { isRelevantChange, type SettingsArea } from "../lib/settings-change";
import { printError } from "../lib/errors";
import { wait } from "../lib/promises";

const KEY_SETTINGS = [
  "magicKey",
  "blurKey",
  "hints",
  "stickyKey",
  "actionKey",
  "cancelKey",
  "cycleKey",
] as const;
const RELEVANT_KEYS: readonly (keyof Settings)[] = [
  ...KEY_SETTINGS,
  "blackList",
];
const DEBOUNCE_MS = 200;

export interface SettingsWatcherDeps {
  hinterClient: { readonly isHinting: boolean };
  keyboardHandler: Pick<
    KeyboardHandlerContentAll,
    "newBlacklistTicket" | "setup" | "updateBlacklist"
  >;
  settingsClient: Pick<
    typeof settingsClient,
    "getWithBlacklistMatch" | "matchBlacklist"
  >;
  url: () => string;
  onLoaded: () => void;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  activeArea: () => Promise<SettingsArea>;
}

export class SettingsWatcher {
  private readonly deps: SettingsWatcherDeps;
  private readonly wait: (ms: number, signal: AbortSignal) => Promise<void>;
  private debounceController: AbortController | null = null;

  constructor(deps: SettingsWatcherDeps) {
    this.deps = deps;
    this.wait = deps.wait ?? wait;
  }

  async load(): Promise<void> {
    const { keyboardHandler, settingsClient, url, onLoaded } = this.deps;
    const ticket = keyboardHandler.newBlacklistTicket();
    const [setting, matchedBlacklist] =
      await settingsClient.getWithBlacklistMatch([...KEY_SETTINGS], url());
    keyboardHandler.setup(setting, matchedBlacklist, ticket);
    console.debug("settings loaded");
    onLoaded();
  }

  private async refreshBlacklist(): Promise<void> {
    const { keyboardHandler, settingsClient, url } = this.deps;
    const ticket = keyboardHandler.newBlacklistTicket();
    const matched = await settingsClient.matchBlacklist(url());
    keyboardHandler.updateBlacklist(matched, ticket);
  }

  /** Never rejects; errors are printed. */
  async handleNavigateSuccess(): Promise<void> {
    await this.refreshBlacklist().catch(printError);
  }

  /** Never rejects; errors other than a superseded debounce are printed. */
  async handleStorageChange(
    changes: Record<string, unknown>,
    areaName: string,
  ): Promise<void> {
    try {
      await this.reloadOnChange(changes, areaName);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      printError(e);
    }
  }

  private async reloadOnChange(
    changes: Record<string, unknown>,
    areaName: string,
  ): Promise<void> {
    const { hinterClient, activeArea } = this.deps;
    if (!(await isRelevantChange(changes, areaName, RELEVANT_KEYS, activeArea)))
      return;
    this.debounceController?.abort();
    this.debounceController = new AbortController();
    const { signal } = this.debounceController;
    await this.wait(DEBOUNCE_MS, signal);
    /* WHY: blacklisting the site, or switching to a storage area whose
       blacklist matches (no `blackList` key changes then), must end a running
       (sticky) session now, while the other key settings wait for it so they
       do not change mid-session. Without a session, load() below matches the
       blacklist itself. */
    if (hinterClient.isHinting) {
      try {
        await this.refreshBlacklist();
      } catch (e) {
        // WHY: a failed refresh must not stop the handler from reaching the settings reload.
        printError(e);
      }
      signal.throwIfAborted();
    }
    while (hinterClient.isHinting) {
      await this.wait(DEBOUNCE_MS, signal);
    }
    await this.load();
  }
}
