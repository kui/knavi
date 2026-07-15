import { sendToRuntime } from "./chrome-messages";
import type { SingleLetter } from "./strings";

function noop() {
  /* WHY: intentionally empty — settled callback for the removeBarrier promise. */
}

export default class HinterClient {
  private hinting: boolean;
  /**
   * WHY: attachHints() awaits this barrier so RemoveHintsInTab always reaches
   * content-root before AttachHintsInTab, preventing session interleaving.
   * Always resolves, never rejects.
   */
  private removeBarrier: Promise<void> | null = null;

  constructor() {
    this.hinting = false;
  }

  get isHinting() {
    return this.hinting;
  }

  /**
   * WHY: keyboard focus can move to a frame that did not initiate the hint
   * session, so every frame's flag is synced via the SyncHintingState
   * broadcast (see TabMessages in chrome-messages.ts and #120).
   */
  syncHinting(active: boolean) {
    this.hinting = active;
  }

  async attachHints() {
    if (this.hinting) throw Error("Illegal state");
    /* WHY: without this barrier, rapid action→sticky sequences can interleave
       sessions (RemoveHintsInTab arriving after AttachHintsInTab) and silently
       drop hitHint calls. */
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

  async cycleHint() {
    if (!this.hinting) throw Error("Illegal state");
    await sendToRuntime("CycleHint", undefined);
  }

  async removeHints(options: ActionOptions, execute: boolean) {
    if (!this.hinting) throw Error("Illegal state");
    this.hinting = false;
    const p = sendToRuntime("RemoveHints", { options, execute });
    this.removeBarrier = p.then(noop, noop);
    await p;
  }
}
