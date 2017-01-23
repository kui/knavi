// @flow

import settings from "./settings";
import BlackList from "./blacklist";
import type { Settings } from "./settings";
import type { IsBlackListed } from "./settings-client";

let settingValues: Promise<Settings>;
let blackList: Promise<BlackList>;

(async () => {
  await settings.init();
  settingValues = settings.load();
  settingValues.then((s) => console.log("Init load settings", s));
  blackList = settingValues.then((s) => new BlackList(s.blackList));

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
    case "IsBlackListed":
      handleIsBlackListed(message, sendResponse);
      return true;
    case "GetSettings":
      handleGetSettings(sendResponse);
      return true;
    }
  });
})();

async function handleIsBlackListed({ url }: IsBlackListed, sendResponse) {
  sendResponse((await blackList).match(url));
}

async function handleGetSettings(sendResponse) {
  sendResponse(await settingValues);
}

export type BroadcastNewSettings = {
  type: "BroadcastNewSettings";
  settings: Settings;
};

chrome.storage.onChanged.addListener(async () => {
  settingValues = settings.load();
  settingValues.then((s) => console.log("Settings changed", s));

  blackList = settingValues.then((s) => new BlackList(s.blackList));

  const tabs = new Promise((resolve) => chrome.tabs.query({}, resolve));
  const s = await settingValues;
  for (const tab of await tabs) {
    chrome.tabs.sendMessage(
      tab.id,
      ({
        type: "BroadcastNewSettings",
        settings: s,
      }: BroadcastNewSettings),
    );
  }
});
