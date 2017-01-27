// @flow

import { recieve, sendTo } from "./message-passing";
import settings from "./settings";
import BlackList from "./blacklist";
import type { Settings } from "./settings";
import type { IsBlackListed } from "./settings-client";

let settingValues: Promise<Settings>;
let blackList: Promise<BlackList>;

export type BroadcastNewSettings = {
  type: "BroadcastNewSettings";
  settings: Settings;
};

(async () => {
  await settings.init();
  settingValues = settings.load();
  settingValues.then((s) => console.log("Init load settings", s));
  blackList = settingValues.then((s) => new BlackList(s.blackList));

  recieve("IsBlackListed", async ({ url }: IsBlackListed, s, sendResponse) => {
    sendResponse((await blackList).match(url));
  });

  recieve("GetSettings", async (m, s, sendResponse) => {
    sendResponse(await settingValues);
  });
})();

chrome.storage.onChanged.addListener(async () => {
  settingValues = settings.load();
  settingValues.then((s) => console.log("Settings changed", s));

  blackList = settingValues.then((s) => new BlackList(s.blackList));

  const tabs = new Promise((resolve) => chrome.tabs.query({}, resolve));
  const s: BroadcastNewSettings = {
    type: "BroadcastNewSettings",
    settings: await settingValues,
  };
  for (const tab of await tabs) {
    sendTo(s, tab.id);
  }
});
