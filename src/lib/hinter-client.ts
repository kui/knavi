import { sendToRuntime } from "./chrome-messages";
import type { SingleLetter } from "./strings";

export default class HinterClient {
  private hinting: boolean;

  constructor() {
    this.hinting = false;
  }

  get isHinting() {
    return this.hinting;
  }

  async attachHints() {
    if (this.hinting) throw Error("Illegal state");
    this.hinting = true;
    try {
      await sendToRuntime("AttachHints");
    } catch (e) {
      this.hinting = false;
      throw e;
    }
  }

  async hitHint(key: SingleLetter) {
    if (!this.hinting) throw Error("Illegal state");
    await sendToRuntime("HitHint", { key });
  }

  async removeHints(options: ActionOptions, execute: boolean) {
    if (!this.hinting) throw Error("Illegal state");
    this.hinting = false;
    await sendToRuntime("RemoveHints", { options, execute });
  }
}
