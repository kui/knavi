import settings from "../lib/settings.ts";
import { BlackList } from "../lib/blacklist.ts";
import { AdditionalSelectors } from "../lib/additional-selectors.ts";
import { Router } from "../lib/chrome-messages.ts";
import { printError } from "../lib/errors.ts";

chrome.storage.onChanged.addListener(() => {
  settings.init(true).catch(printError);
});

export const router = Router.newInstance()
  .add("GetSettings", async (message) => {
    const storage = await settings.init();
    return storage.get(message.names);
  })
  .add("MatchBlacklist", async (message) => {
    const storage = await settings.init();
    const blacklist = new BlackList(await storage.getSingle("blackList"));
    return blacklist.match(message.url);
  })
  .add("MatchAdditionalSelectors", async (message) => {
    const storage = await settings.init();
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
  });
