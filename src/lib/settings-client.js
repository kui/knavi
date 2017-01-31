// @flow

import { send, subscribe } from "./chrome-messages";

import type { Settings } from "./settings";
import type { BroadcastNewSettings } from "./settings-background";

export type GetSettings = {
  type: "GetSettings";
};
export type GetMatchedBlackList = {
  type: "GetMatchedBlackList";
  url: string;
};

export default {
  get(): Promise<Settings> {
    return send(({ type: "GetSettings" }: GetSettings));
  },
  subscribe(callback: (s: Settings) => any): void {
    subscribe("BroadcastNewSettings", (message: BroadcastNewSettings) => {
      callback(message.settings);
    });
  },
  getMatchedBlackList(url: string): Promise<string[]> {
    return send(({ type: "GetMatchedBlackList", url }: GetMatchedBlackList));
  }
};
