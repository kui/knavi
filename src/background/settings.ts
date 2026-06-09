import settings from "../lib/settings";
import { BlackList, togglePattern } from "../lib/blacklist";
import { AdditionalSelectors } from "../lib/additional-selectors";
import { Router } from "../lib/chrome-messages";
import { printError } from "../lib/errors";

// Serializes ToggleBlacklist read-modify-write so rapid toggles (e.g. quick
// clicks in the popup) do not lose updates. Note this does not guard against
// the options page, which saves the whole blacklist text directly rather than
// going through this message.
let toggleQueue: Promise<unknown> = Promise.resolve();

chrome.storage.onChanged.addListener(() => {
  settings.init(true).catch(printError);
});

export const router = Router.newInstance()
  .add("GetSettings", async (message) => {
    const storage = await settings.init();
    return storage.getWithDefaults(message.names);
  })
  .add("MatchBlacklist", async (message) => {
    const storage = await settings.init();
    const blacklist = new BlackList(
      await storage.getSingleWithDefault("blackList"),
    );
    return blacklist.match(message.url);
  })
  .add("MatchAdditionalSelectors", async (message) => {
    const storage = await settings.init();
    let additionalSelectors;
    try {
      additionalSelectors = new AdditionalSelectors(
        await storage.getSingleWithDefault("additionalSelectors"),
      );
    } catch (e) {
      printError(e);
      additionalSelectors = new AdditionalSelectors("{}");
    }
    return additionalSelectors.match(message.url);
  })
  .add("ToggleBlacklist", (message) => {
    const run = async () => {
      const storage = await settings.init();
      const current = await storage.getSingleWithDefault("blackList");
      const { text, added } = togglePattern(current, message.pattern);
      await storage.setSingle("blackList", text);
      return { added };
    };
    // .then(run, run): run even if previous toggle failed, so a transient
    // error doesn't permanently block the queue.
    const next = toggleQueue.then(run, run);
    toggleQueue = next.catch(() => undefined);
    return next;
  });
