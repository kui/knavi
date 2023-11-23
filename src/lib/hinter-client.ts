import { send } from "./chrome-messages.js";

export default class HinterClient {
  constructor() {
    this.isHinting = false;
  }

  attachHints() {
    if (this.isHinting) throw Error("Illegal state");
    this.isHinting = true;
    send({ type: "AttachHints" });
  }

  hitHint(key) {
    if (!this.isHinting) throw Error("Illegal state");
    send({ type: "HitHint", key });
  }

  removeHints(options) {
    if (!this.isHinting) throw Error("Illegal state");
    this.isHinting = false;
    send({ type: "RemoveHints", options });
  }
}
