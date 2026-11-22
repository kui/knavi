import { sendToRuntime } from "./chrome-messages";
import type { SingleLetter } from "./strings";

function noop() {
  /* WHY: intentionally empty — settled callback for the removeBarrier promise. */
}

/* WHY: crypto.randomUUID is undefined on non-secure pages (plain http other
   than localhost) and content scripts follow the page's secure context, so
   it would break knavi there. getRandomValues is available everywhere. */
function randomHex() {
  return Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) =>
    n.toString(16).padStart(8, "0"),
  ).join("");
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
  /** The `ready` of the latest attachHints while its dispatch is pending. */
  private pendingDispatch: Promise<void> | null = null;
  /** Makes this frame's session ids recognizable: `${idPrefix}-${ownSeq}`. */
  private readonly idPrefix = randomHex();
  private ownSeq = 0;
  private ownSessionId: string | null = null;
  /** Id of the latest session announced by SyncHintingState(true) or started here. */
  private currentSessionId: string | null = null;

  constructor() {
    this.hinting = false;
  }

  get isHinting() {
    return this.hinting;
  }

  /**
   * True when the current session was started by this frame. `isHinting` is
   * tab-wide (synced to every frame); this is per frame. Decided by session id
   * because the end broadcast of an earlier session can arrive after this
   * frame started the next one.
   */
  get ownsSession() {
    return (
      this.hinting &&
      this.ownSessionId !== null &&
      this.currentSessionId === this.ownSessionId
    );
  }

  /**
   * WHY: keyboard focus can move to a frame that did not initiate the hint
   * session, so every frame's flag is synced via the SyncHintingState
   * broadcast (see TabMessages in chrome-messages.ts and #120).
   */
  syncHinting(active: false): void;
  syncHinting(active: true, sessionId: string): void;
  syncHinting(...args: [active: false] | [active: true, sessionId: string]) {
    const [active, sessionId] = args;
    /* WHY: the previous session's SyncHintingState(false) broadcast can arrive
       while attachHints waits for the remove barrier. Applying it would undo
       the synchronous flag and leak queued hint letters to the page (#169). */
    if (!active && this.pendingDispatch) return;
    if (active) {
      /* WHY: SyncHintingState(true) is sent when the background receives
         AttachHints and is not ordered against this frame's later attaches, so
         it can arrive after this frame started its next session. Applying it
         would hand that session's ownership to the older id. */
      if (this.isOlderOwnId(sessionId)) return;
      this.currentSessionId = sessionId;
    }
    this.hinting = active;
  }

  private isOlderOwnId(sessionId: string) {
    const prefix = `${this.idPrefix}-`;
    return (
      sessionId.startsWith(prefix) &&
      Number(sessionId.slice(prefix.length)) < this.ownSeq
    );
  }

  async attachHints() {
    if (this.hinting) throw Error("Illegal state");
    /* WHY: hinting flips synchronously so hint letters typed while the barrier
       is pending are already routed here. Every later call waits on `ready`,
       which keeps them in typing order and after AttachHintsInTab, instead of
       leaking to the page or being dropped. */
    this.hinting = true;
    const sessionId = `${this.idPrefix}-${++this.ownSeq}`;
    this.ownSessionId = sessionId;
    this.currentSessionId = sessionId;
    const barrier = this.removeBarrier;
    /* WHY: AttachHints is answered only when the session ends, and ending it
       needs RemoveHints. If `ready` waited for the answer, removeHints would
       wait for the end of the session it is trying to end, so `ready` settles
       when the message is dispatched. */
    let attach: Promise<void> | undefined;
    const dispatched = (async () => {
      if (barrier) await barrier;
      attach = sendToRuntime("AttachHints", { sessionId });
    })();
    this.ready = dispatched;
    this.pendingDispatch = dispatched;
    const clear = () => {
      if (this.pendingDispatch === dispatched) this.pendingDispatch = null;
    };
    dispatched.then(clear, clear);
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
