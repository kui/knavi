import { sendToRuntime } from "./chrome-messages";
import type { SingleLetter } from "./strings";

function noop() {
  /* intentionally empty */
}

export default class HinterClient {
  private hinting: boolean;
  // Resolves when the in-flight RemoveHints round-trip completes (always
  // resolves, never rejects). attachHints() awaits this barrier before sending
  // AttachHints so that RemoveHintsInTab always reaches content-root before
  // AttachHintsInTab, preventing session interleaving.
  private removeBarrier: Promise<void> | null = null;

  constructor() {
    this.hinting = false;
  }

  get isHinting() {
    return this.hinting;
  }

  // Called by content-all.ts when it observes AttachHints or RemoveHints
  // arriving at the root frame. Keeps the root frame's keyboard handler in
  // sync with sessions initiated by child frames.
  syncHinting(active: boolean) {
    this.hinting = active;
  }

  async attachHints() {
    if (this.hinting) throw Error("Illegal state");
    // Wait for any in-flight remove to finish so RemoveHintsInTab arrives at
    // content-root before AttachHintsInTab. Without this, rapid action→sticky
    // sequences can interleave sessions and silently drop hitHint calls.
    if (this.removeBarrier) await this.removeBarrier;
    this.hinting = true;
    try {
      await sendToRuntime("AttachHints", undefined);
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
    const p = sendToRuntime("RemoveHints", { options, execute });
    this.removeBarrier = p.then(noop, noop);
    await p;
  }
}
