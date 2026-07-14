import settings from "../lib/settings";
import { BlackList, togglePattern } from "../lib/blacklist";
import { AdditionalSelectors } from "../lib/additional-selectors";
import { Router } from "../lib/chrome-messages";
import { printError } from "../lib/errors";

/* WHY: Serializes ToggleBlacklist read-modify-write so rapid toggles (e.g. quick
   clicks in the popup) do not lose updates. Note this does not guard against
   the options page, which saves the whole blacklist text directly rather than
   going through this message. */
let toggleQueue: Promise<unknown> = Promise.resolve();

/* WHY: The active storage area (sync vs local) is selected by the `_area` marker
   in local storage. When the user switches it, invalidate the memoized area
   and back-fill defaults into the newly active area: onInstalled only ran on
   install/update, so a later switch would otherwise leave that area empty. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !("_area" in changes)) return;
  settings
    .getStorage(true)
    .then(() => settings.backfillDefaults())
    .catch(printError);
});

export const router = Router.newRuntimeInstance()
  .add("GetSettings", async (message) => {
    const storage = await settings.getStorage();
    return storage.get(message.names);
  })
  .add("MatchBlacklist", async (message) => {
    const storage = await settings.getStorage();
    const blacklist = new BlackList(await storage.getSingle("blackList"));
    return blacklist.match(message.url);
  })
  .add("MatchAdditionalSelectors", async (message) => {
    const storage = await settings.getStorage();
    let additionalSelectors;
    try {
      additionalSelectors = new AdditionalSelectors(
        await storage.getSingle("additionalSelectors"),
      );
    } catch (e) {
      printError(e);
      additionalSelectors = new AdditionalSelectors("{}");
    }
    return additionalSelectors.match(message.url);
  })
  .add("ToggleBlacklist", (message) => {
    const run = async () => {
      const storage = await settings.getStorage();
      const current = await storage.getSingle("blackList");
      const { text, added } = togglePattern(current, message.pattern);
      await storage.setSingle("blackList", text);
      return { added };
    };
    /* WHY: .then(run, run): run even if previous toggle failed, so a transient
       error doesn't permanently block the queue. */
    const next = toggleQueue.then(run, run);
    toggleQueue = next.catch(() => undefined);
    return next;
  });
