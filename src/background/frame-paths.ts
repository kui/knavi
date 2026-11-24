import type { SessionId } from "../lib/chrome-messages";

/**
 * The path → frameId table of the hint session running in each tab. Frames
 * report their path when a session starts (see FramePath in
 * content-all/frame-path.ts). The path is self-reported and a page can lie
 * about it; only the frameId (`sender.frameId`) is trusted. The first frame
 * to report a path holds it for the session, and a later report of that path
 * from another frame is dropped. The empty path belongs to frame 0. A path
 * nobody has reported yet can be claimed by any frame.
 */

const LOOKUP_TIMEOUT_MS = 300;

type Waiter = (frameId: number | undefined) => void;
type Waiters = Map<string, Waiter[]>;

interface Session {
  id: SessionId;
  frames: Map<string, number>;
  waiters: Waiters;
}

const sessions = new Map<number, Session>();
/**
 * Lookups of a session whose table has not started yet, by tab and session
 * id. The table is started only once content-root has accepted the session,
 * and frame 0 can already be requesting its child frames' rects by then.
 */
const early = new Map<number, Map<SessionId, Waiters>>();

function key(path: readonly string[]): string {
  return JSON.stringify(path);
}

function newSession(id: SessionId, waiters: Waiters): Session {
  // INVARIANT: the top frame is always frame 0.
  return { id, frames: new Map([[key([]), 0]]), waiters };
}

function settleWaiters(waiters: Waiters) {
  for (const list of waiters.values()) {
    for (const resolve of list) resolve(undefined);
  }
}

/**
 * Starts the table of session `sessionId`, which content-root has accepted,
 * dropping the previous one.
 */
export function reset(tabId: number, sessionId: SessionId): void {
  const old = sessions.get(tabId);
  if (old) settleWaiters(old.waiters);
  const pending = early.get(tabId);
  early.delete(tabId);
  const waiters = pending?.get(sessionId) ?? new Map<string, Waiter[]>();
  pending?.delete(sessionId);
  pending?.forEach(settleWaiters);
  sessions.set(tabId, newSession(sessionId, waiters));
}

/** Drops the table if it belongs to session `sessionId`. */
export function end(tabId: number, sessionId: SessionId): void {
  const old = sessions.get(tabId);
  if (!old) return;
  if (old.id !== sessionId) {
    console.debug(
      "Keep the frame paths of",
      old.id,
      "on the end of",
      sessionId,
    );
    return;
  }
  settleWaiters(old.waiters);
  sessions.delete(tabId);
}

/** Drops everything kept for the tab, whichever session it belongs to. */
export function forgetTab(tabId: number): void {
  const old = sessions.get(tabId);
  if (old) settleWaiters(old.waiters);
  sessions.delete(tabId);
  early.get(tabId)?.forEach(settleWaiters);
  early.delete(tabId);
}

/** Ignored outside a hint session, so a late report cannot leak a table. */
export function report(
  tabId: number,
  path: readonly string[],
  frameId: number,
): void {
  const session = sessions.get(tabId);
  if (!session) return;
  if (path.length === 0 && frameId !== 0) {
    console.debug("Frame", frameId, "reported the top frame's path");
    return;
  }
  const k = key(path);
  const registered = session.frames.get(k);
  if (registered != null && registered !== frameId) {
    console.debug("Frame", frameId, "reported", path, "held by", registered);
    return;
  }
  session.frames.set(k, frameId);
  const waiters = session.waiters.get(k);
  session.waiters.delete(k);
  waiters?.forEach((resolve) => resolve(frameId));
}

/**
 * Resolves as soon as the frame at `path` has reported in the table of
 * session `sessionId`, or to undefined after a timeout or once another
 * session's table starts. A request can overtake the path report of a frame
 * whose content script has only just started (#95, #109), and the start of
 * its own session's table.
 */
export function lookup(
  tabId: number,
  sessionId: SessionId,
  path: readonly string[],
  timeoutMs = LOOKUP_TIMEOUT_MS,
): Promise<number | undefined> {
  const session = sessions.get(tabId);
  // WHY: session ids only grow within a tab, so this session has ended.
  if (session && session.id > sessionId) return Promise.resolve(undefined);
  const k = key(path);
  const own = session?.id === sessionId ? session : undefined;
  const known = own?.frames.get(k);
  if (known != null) return Promise.resolve(known);

  const { promise, resolve } = Promise.withResolvers<number | undefined>();
  const bucket = own?.waiters ?? earlyWaiters(tabId, sessionId);
  const waiters = bucket.get(k) ?? [];
  bucket.set(k, waiters);
  const timer = setTimeout(() => {
    const i = waiters.indexOf(settle);
    if (i >= 0) waiters.splice(i, 1);
    if (waiters.length === 0 && bucket.get(k) === waiters) bucket.delete(k);
    const pending = early.get(tabId);
    if (pending?.get(sessionId)?.size === 0) pending.delete(sessionId);
    if (pending?.size === 0) early.delete(tabId);
    resolve(undefined);
  }, timeoutMs);
  function settle(frameId: number | undefined) {
    clearTimeout(timer);
    resolve(frameId);
  }
  waiters.push(settle);
  return promise;
}

function earlyWaiters(tabId: number, sessionId: SessionId): Waiters {
  let pending = early.get(tabId);
  if (!pending) {
    pending = new Map();
    early.set(tabId, pending);
  }
  let waiters = pending.get(sessionId);
  if (!waiters) {
    waiters = new Map();
    pending.set(sessionId, waiters);
  }
  return waiters;
}
