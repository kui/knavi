// @flow

import { send, subscribe } from "./message-passing";

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
      send(({ type: "GetSettings" }: GetSettings), resolve);
    });
  },
  subscribe(callback: (s: Settings) => any): void {
    subscribe("BroadcastNewSettings", (message: BroadcastNewSettings) => {
      callback(message.settings);
    });
  },
  isBlackListed(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      send(({ type: "IsBlackListed", url }: IsBlackListed), resolve);
    });
  }
};
