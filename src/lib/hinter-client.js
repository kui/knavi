// @flow

import { send } from "./message-passing";
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
    send(({ type: "AttachHints" }: AttachHints));
  }

  hitHint(key: string) {
    if (!this.isHinting) throw Error("Illegal state");
    send(({ type: "HitHint", key }: HitHint));
  }

  removeHints(options: ActionOptions) {
    if (!this.isHinting) throw Error("Illegal state");
    this.isHinting = false;
    send(({ type: "RemoveHints", options }: RemoveHints));
  }
}
