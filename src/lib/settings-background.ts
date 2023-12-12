import settings from "./settings";
import { BlackList } from "./blacklist";
import { AdditionalSelectors } from "./additional-selectors";
import { Router } from "./chrome-messages";
import { printError } from "./errors";

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
