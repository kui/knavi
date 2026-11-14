import settings from "./settings";
import { BlackList } from "./blacklist";
import { sendToRuntime } from "./chrome-messages";

/* WHY: Reads go straight to chrome.storage instead of messaging the background,
   so loading a page or iframe does not start the service worker. Writes stay
   in the background to share its serialization queue. */
export default {
  async get<K extends keyof Settings>(names: K[]): Promise<Pick<Settings, K>> {
    /* WHY: re-resolve every time because the active area (sync vs local) can
       be switched at runtime and this module has no storage listener of its
       own to invalidate the memoized area. */
    const storage = await settings.getStorage(true);
    try {
      return await storage.get(names);
    } catch (e) {
      /* WHY: before the onInstalled back-fill has written `css`, the default
         comes from the extension's own file, which a content script cannot
         fetch. Ask the background in that rare case. */
      if (!names.includes("css" as never)) throw e;
      return sendToRuntime("GetSettings", { names });
    }
  },
  async matchBlacklist(url: string): Promise<string[]> {
    const storage = await settings.getStorage(true);
    return new BlackList(await storage.getSingle("blackList")).match(url);
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
