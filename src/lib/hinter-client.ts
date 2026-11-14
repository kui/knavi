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
  /** Settles once AttachHintsInTab has been sent; hint input waits on it. */
  private ready: Promise<void> = Promise.resolve();

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
    /* WHY: hinting flips synchronously so hint letters typed while the barrier
       is pending are already routed here. Every later call waits on `ready`,
       which keeps them in typing order and after AttachHintsInTab, instead of
       leaking to the page or being dropped. */
    this.hinting = true;
    const barrier = this.removeBarrier;
    const attach = (async () => {
      /* WHY: without this barrier, rapid action→sticky sequences can
         interleave sessions (RemoveHintsInTab arriving after AttachHintsInTab)
         and silently drop hitHint calls. */
      if (barrier) await barrier;
      await sendToRuntime("AttachHints", undefined);
    })();
    this.ready = attach;
    try {
      await attach;
    } catch (e) {
      if (this.ready === attach) this.hinting = false;
      throw e;
    }
  }

  async hitHint(key: SingleLetter) {
    if (!this.hinting) throw Error("Illegal state");
    await this.ready;
    await sendToRuntime("HitHint", { key });
  }

  async cycleHint() {
    if (!this.hinting) throw Error("Illegal state");
    await this.ready;
    await sendToRuntime("CycleHint", undefined);
  }

  async removeHints(options: ActionOptions, execute: boolean) {
    if (!this.hinting) throw Error("Illegal state");
    this.hinting = false;
    const p = this.ready.then(() =>
      sendToRuntime("RemoveHints", { options, execute }),
    );
    this.removeBarrier = p.then(noop, noop);
    await p;
  }
}
