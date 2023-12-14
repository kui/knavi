import { sendToRuntime } from "./chrome-messages";
import { SingleLetter } from "./strings";

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
    await sendToRuntime("AttachHints", undefined);
  }

  async hitHint(key: SingleLetter) {
    if (!this.hinting) throw Error("Illegal state");
    await sendToRuntime("HitHint", { key });
  }

  async removeHints(options: ActionOptions) {
    if (!this.hinting) throw Error("Illegal state");
    this.hinting = false;
    await sendToRuntime("RemoveHints", { options });
  }
}
