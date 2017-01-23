// @flow

import type { Settings } from "./settings";
import type { BroadcastNewSettings } from "./settings-background";

export type GetSettings = {
  type: "GetSettings";
};
export type IsBlackListed = {
  type: "IsBlackListed";
  url: string;
};

export default {
  get(): Promise<Settings> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(({ type: "GetSettings" }: GetSettings), resolve);
    });
  },
  subscribe(callback: (s: Settings) => any): void {
    chrome.runtime.onMessage.addListener((message: BroadcastNewSettings) => {
      if (message.type === "BroadcastNewSettings") callback(message.settings);
    });
  },
  isBlackListed(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(({ type: "IsBlackListed", url }: IsBlackListed), resolve);
    });
  }
};
