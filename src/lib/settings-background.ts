import { recieve, sendTo } from "./chrome-messages.js";
import settings from "./settings.js";
import BlackList from "./blacklist.js";
import AdditionalSelectors from "./additional-selectors.js";

let settingValues;
let blackList;
let additionalSelectors;

(async () => {
  await settings.init();
  settingValues = settings.load();
  settingValues.then((s) => console.log("Init load settings", s));
  blackList = settingValues.then((s) => new BlackList(s.blackList));
  additionalSelectors = buildAdditionalSelectorsPromise();

  recieve("GetMatchedBlackList", async ({ url }, s, sendResponse) => {
    sendResponse((await blackList).match(url));
  });

  recieve("GetMatchedSelectors", async ({ url }, s, sendResponse) => {
    sendResponse((await additionalSelectors).match(url));
  });

  recieve("GetSettings", async (m, s, sendResponse) => {
    sendResponse(await settingValues);
  });
})();

chrome.storage.onChanged.addListener(async () => {
  settingValues = settings.load();
  settingValues.then((s) => console.log("Settings changed", s));

  blackList = settingValues.then((s) => new BlackList(s.blackList));
  additionalSelectors = buildAdditionalSelectorsPromise();
  const tabs = new Promise((resolve) => chrome.tabs.query({}, resolve));
  const s = {
    type: "BroadcastNewSettings",
    settings: await settingValues,
  };
  for (const tab of await tabs) {
    sendTo(s, tab.id);
  }
});

function buildAdditionalSelectorsPromise() {
  return settingValues
    .then((s) => new AdditionalSelectors(s.additionalSelectors))
    .catch((e) => {
      console.error(e);
      return new AdditionalSelectors("{}");
    });
}
