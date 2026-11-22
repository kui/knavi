import { sendToRuntime } from "./chrome-messages";
import type { SessionId } from "./chrome-messages";
import type { SingleLetter } from "./strings";

function noop() {
  /* WHY: intentionally empty — settled callback that keeps the queue from rejecting. */
}

/**
 * This frame's view of the tab's live session, built from SyncHintingState
 * broadcasts and the replies to this frame's own AttachHints. Those arrive in
 * no fixed order, so anything older than the latest session id is dropped.
 */
export class TabSession {
  /* WHY: content-root numbers sessions from 1. */
  private latest: SessionId = 0;
  private active = false;

  /** The live session's id, or null. */
  get id(): SessionId | null {
    return this.active ? this.latest : null;
  }

  /** Returns false when the update is stale and ignored. */
  apply(active: boolean, id: SessionId): boolean {
    if (id < this.latest) return false;
    /* WHY: the true broadcast of a session can arrive after its false. */
    if (id === this.latest && active && !this.active) return false;
    this.latest = id;
    this.active = active;
    return true;
  }
}

/** An AttachHints this frame sent. */
interface OwnAttach {
  /** undefined until content-root replies, null if the attach failed. */
  id: SessionId | null | undefined;
  /** removeHints was called before the reply. */
  removed: boolean;
}

export default class HinterClient {
  private readonly tab = new TabSession();
  /** The latest attach this frame made. */
  private own: OwnAttach | null = null;
  /**
   * WHY: every hint message goes through this queue, so content-root receives
   * them in the order they were typed: a RemoveHints before the next
   * AttachHints, letters after the AttachHints they belong to. Never rejects.
   */
  private queue: Promise<void> = Promise.resolve();

  /**
   * Tab-wide: true while any frame's session is live, synced to every frame
   * because keyboard focus can move to a frame that did not initiate the
   * session (#120). Flips synchronously on attachHints and removeHints.
   */
  get isHinting() {
    /* WHY: until the reply, the frame's own attach decides; sync broadcasts
       of earlier sessions must not undo it and leak letters to the page (#169). */
    const pending = this.pendingOwn();
    if (pending) return !pending.removed;
    return this.tab.id !== null;
  }

  /** True when the live session was started by this frame. */
  get ownsSession() {
    const own = this.own;
    if (!own) return false;
    if (own.id === undefined) return !own.removed;
    return own.id !== null && this.tab.id === own.id;
  }

  /** Returns false when the message was stale and ignored. */
  syncHinting(active: boolean, sessionId: SessionId): boolean {
    return this.tab.apply(active, sessionId);
  }

  /** Resolves once the session has started. */
  async attachHints(): Promise<void> {
    if (this.isHinting) throw Error("Illegal state");
    const own: OwnAttach = { id: undefined, removed: false };
    this.own = own;
    await this.enqueue(async () => {
      try {
        own.id = (await sendToRuntime("AttachHints", undefined)).sessionId;
      } catch (e) {
        own.id = null;
        throw e;
      }
      /* WHY: the reply can arrive before the true broadcast of the session. */
      this.tab.apply(!own.removed, own.id);
    });
  }

  async hitHint(key: SingleLetter): Promise<void> {
    if (!this.isHinting) throw Error("Illegal state");
    const target = this.target();
    await this.enqueue(async () => {
      const sessionId = target();
      if (sessionId === null) return;
      await sendToRuntime("HitHint", { sessionId, key });
    });
  }

  async cycleHint(): Promise<void> {
    if (!this.isHinting) throw Error("Illegal state");
    const target = this.target();
    await this.enqueue(async () => {
      const sessionId = target();
      if (sessionId === null) return;
      await sendToRuntime("CycleHint", { sessionId });
    });
  }

  async removeHints(options: ActionOptions, execute: boolean): Promise<void> {
    if (!this.isHinting) throw Error("Illegal state");
    const target = this.target();
    const pending = this.pendingOwn();
    if (pending) {
      pending.removed = true;
    } else {
      const id = this.tab.id;
      if (id !== null) this.tab.apply(false, id);
    }
    await this.enqueue(async () => {
      const sessionId = target();
      if (sessionId === null) return;
      await sendToRuntime("RemoveHints", { sessionId, options, execute });
    });
  }

  /**
   * The session that input made now is meant for. Read when the queued
   * message is sent, because the id of an attach still in flight is known
   * only then.
   */
  private target(): () => SessionId | null {
    const pending = this.pendingOwn();
    if (pending) return () => pending.id ?? null;
    const id = this.tab.id;
    return () => id;
  }

  /** This frame's latest attach while its reply is pending. */
  private pendingOwn(): OwnAttach | null {
    return this.own?.id === undefined ? this.own : null;
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    const p = this.queue.then(op);
    this.queue = p.then(noop, noop);
    return p;
  }
}
