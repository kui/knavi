// @flow

import { ActionOptions } from "./action-handlers";

export type AttachHints = {
  type: "AttachHints";
};
export type HitHint = {
  type: "HitHint";
  key: string;
};
export type RemoveHints = {
  type: "RemoveHints";
  options: ActionOptions;
};

export default class HinterClient {
  isHinting: boolean;

  constructor() {
    this.isHinting = false;
  }

  attachHints() {
    if (this.isHinting) throw Error("Illegal state");
    this.isHinting = true;
    chrome.runtime.sendMessage(({ type: "AttachHints" }: AttachHints));
  }

  hitHint(key: string) {
    if (!this.isHinting) throw Error("Illegal state");
    chrome.runtime.sendMessage(({ type: "HitHint", key }: HitHint));
  }

  removeHints(options: ActionOptions) {
    if (!this.isHinting) throw Error("Illegal state");
    this.isHinting = false;
    chrome.runtime.sendMessage(({ type: "RemoveHints", options }: RemoveHints));
  }
}
