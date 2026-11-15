import { sendToRuntime } from "./chrome-messages";
import type { SingleLetter } from "./strings";

function noop() {
  /* WHY: intentionally empty — settled callback for the removeBarrier promise. */
}

export default class HinterClient {
  private hinting: boolean;
  /**
   * WHY: the AttachHints dispatch waits for this barrier (and hint input waits
   * for that dispatch via `ready`), so RemoveHintsInTab always reaches
   * content-root before AttachHintsInTab. Without it, rapid action→sticky
   * sequences interleave sessions and silently drop hitHint calls.
   * Always resolves, never rejects.
   */
  private removeBarrier: Promise<void> | null = null;
  /** Settles once AttachHints has been dispatched; hint input waits on it. */
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
    /* WHY: AttachHints is answered only when the session ends, and ending it
       needs RemoveHints. If `ready` waited for the answer, removeHints would
       wait for the end of the session it is trying to end, so `ready` settles
       when the message is dispatched. */
    let attach: Promise<void> | undefined;
    const dispatched = (async () => {
      if (barrier) await barrier;
      attach = sendToRuntime("AttachHints", undefined);
    })();
    this.ready = dispatched;
    try {
      await dispatched;
      await attach;
    } catch (e) {
      if (this.ready === dispatched) this.hinting = false;
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
