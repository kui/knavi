import settings from "./settings";
import { BlackList } from "./blacklist";
import { sendToRuntime } from "./chrome-messages";

/* WHY: Reads go straight to chrome.storage instead of messaging the background,
   so loading a page or iframe does not start the service worker. Writes stay
   in the background to share its serialization queue. */

/* WHY: re-resolve the active area (sync vs local) on every read because it can
   be switched at runtime and this module has no storage listener of its own to
   invalidate the memoized area. */
const resolveStorage = () => settings.getStorage(true);

export default {
  async get<K extends keyof Settings>(names: K[]): Promise<Pick<Settings, K>> {
    const storage = await resolveStorage();
    const raw = await storage.getRaw(names);
    /* WHY: the default css comes from a file in the extension, which a content
       script cannot fetch. Until the onInstalled back-fill has stored it, ask
       the background (which can) instead of filling in the default here. */
    if (
      names.some((n) => n === "css") &&
      (raw as Partial<Settings>).css == null
    ) {
      return sendToRuntime("GetSettings", { names });
    }
    return storage.withDefaults(raw, names);
  },
  async matchBlacklist(url: string): Promise<string[]> {
    const storage = await resolveStorage();
    const { blackList } = await storage.get(["blackList"]);
    return new BlackList(blackList).match(url);
  },
  /**
   * Reads `names` and matches `url` against the blacklist with one area
   * resolution and one storage read. `names` must not include `css`.
   */
  async getWithBlacklistMatch<K extends Exclude<keyof Settings, "css">>(
    names: K[],
    url: string,
  ): Promise<[Pick<Settings, K>, string[]]> {
    const storage = await resolveStorage();
    const raw = await storage.getRaw([...names, "blackList" as const]);
    const [current, { blackList }] = await Promise.all([
      storage.withDefaults(raw, names),
      storage.withDefaults(raw, ["blackList"]),
    ]);
    return [current, new BlackList(blackList).match(url)];
  },
  /* WHY: stays a background message: it runs only when hints are requested,
     not on page load, and parsing in the background keeps JSON5 out of every
     content script bundle. */
  matchAdditionalSelectors(url: string): Promise<string[]> {
    return sendToRuntime("MatchAdditionalSelectors", { url });
  },
  toggleBlacklist(pattern: string): Promise<{ added: boolean }> {
    return sendToRuntime("ToggleBlacklist", { pattern });
  },
};
