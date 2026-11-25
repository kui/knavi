import { sendToRuntime } from "./chrome-messages";
import type { HintSession, SessionId, TabMessages } from "./chrome-messages";
import type { SingleLetter } from "./strings";

function noop() {
  /* WHY: intentionally empty — settled callback that keeps the queue from rejecting. */
}

type HintingState = TabMessages["SyncHintingState"]["payload"];

/**
 * This frame's view of the tab's live session, built from SyncHintingState
 * broadcasts and the replies to this frame's own AttachHints. Those arrive in
 * no fixed order, so anything older than the latest session id is dropped.
 */
export class TabSession {
  /* WHY: below every id content-root issues. */
  private latest: SessionId = 0;
  private session: HintSession | null = null;

  /** The live session's id, or null. */
  get id(): SessionId | null {
    return this.session?.sessionId ?? null;
  }

  /** The live session's hint letters; null when unknown or none is live. */
  get hintLetters(): string | null {
    return this.session?.hintLetters ?? null;
  }

  /** Returns false when the update is stale and ignored. */
  apply(state: HintingState): boolean {
    const id = state.sessionId;
    if (id < this.latest) return false;
    /* WHY: the true broadcast of a session can arrive after its false. */
    if (id === this.latest && state.active && !this.session) return false;
    this.latest = id;
    this.session = state.active ? state : null;
    return true;
  }
}

/** An AttachHints this frame sent. */
interface OwnAttach {
  state:
    | { kind: "pending"; removed: boolean }
    | { kind: "started"; id: SessionId }
    | { kind: "failed" };
}

/**
 * The session that this frame's input goes to: its own attach while the reply
 * is pending, or else the tab's live session (null when none is live).
 */
type InputTarget = { own: OwnAttach } | { id: SessionId | null };

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
    const t = this.inputTarget();
    return "own" in t || t.id !== null;
  }

  /** True when the live session was started by this frame. */
  get ownsSession() {
    const t = this.inputTarget();
    if ("own" in t) return true;
    const own = this.own?.state;
    return own?.kind === "started" && t.id === own.id;
  }

  /**
   * The hint letters of the session that this frame's input goes to; null
   * until they are known.
   */
  get hintLetters(): string | null {
    return "own" in this.inputTarget() ? null : this.tab.hintLetters;
  }

  /** Returns false when the message was stale and ignored. */
  syncHinting(state: HintingState): boolean {
    return this.tab.apply(state);
  }

  /** Resolves once content-root has accepted the session. */
  async attachHints(): Promise<void> {
    if (this.isHinting) throw Error("Illegal state");
    const own: OwnAttach = { state: { kind: "pending", removed: false } };
    this.own = own;
    await this.enqueue(async () => {
      let session: HintSession;
      try {
        session = await sendToRuntime("AttachHints", undefined);
      } catch (e) {
        own.state = { kind: "failed" };
        throw e;
      }
      const removed = own.state.kind === "pending" && own.state.removed;
      own.state = { kind: "started", id: session.sessionId };
      /* WHY: the reply can arrive before the true broadcast of the session. */
      this.tab.apply({ ...session, active: !removed });
    });
  }

  async hitHint(key: SingleLetter): Promise<void> {
    if (!this.isHinting) throw Error("Illegal state");
    const target = this.resolver(this.inputTarget());
    await this.enqueue(async () => {
      const sessionId = target();
      if (sessionId === null) return;
      await sendToRuntime("HitHint", { sessionId, key });
    });
  }

  async cycleHint(): Promise<void> {
    if (!this.isHinting) throw Error("Illegal state");
    const target = this.resolver(this.inputTarget());
    await this.enqueue(async () => {
      const sessionId = target();
      if (sessionId === null) return;
      await sendToRuntime("CycleHint", { sessionId });
    });
  }

  async removeHints(options: ActionOptions, execute: boolean): Promise<void> {
    if (!this.isHinting) throw Error("Illegal state");
    const t = this.inputTarget();
    const target = this.resolver(t);
    if ("own" in t) {
      t.own.state = { kind: "pending", removed: true };
    } else if (t.id !== null) {
      this.tab.apply({ active: false, sessionId: t.id });
    }
    await this.enqueue(async () => {
      const sessionId = target();
      if (sessionId === null) return;
      await sendToRuntime("RemoveHints", { sessionId, options, execute });
    });
  }

  private inputTarget(): InputTarget {
    const own = this.own;
    /* WHY: until the reply, the frame's own attach decides; sync broadcasts
       of earlier sessions must not undo it and leak letters to the page
       (#169). Once it is removed, a session another frame started meanwhile
       takes the input. */
    if (own?.state.kind === "pending" && !own.state.removed) return { own };
    return { id: this.tab.id };
  }

  /**
   * For an own attach still in flight, reads its id when the queued message
   * is sent, because it is known only then; otherwise the tab's live id taken
   * at call time.
   */
  private resolver(t: InputTarget): () => SessionId | null {
    if ("own" in t)
      return () => (t.own.state.kind === "started" ? t.own.state.id : null);
    return () => t.id;
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    const p = this.queue.then(op);
    this.queue = p.then(noop, noop);
    return p;
  }
}
