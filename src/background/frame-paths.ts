/**
 * The path → frameId table of the hint session running in each tab. Frames
 * report their path when a session starts (see FramePath in
 * content-all/frame-path.ts). The path is self-reported and a page can lie
 * about it; only the frameId (`sender.frameId`) is trusted. A report is
 * therefore accepted only if it cannot take over a path another frame holds:
 * the empty path belongs to frame 0, and a registered path never moves to a
 * different frameId within a session.
 */

const LOOKUP_TIMEOUT_MS = 300;

interface Session {
  frames: Map<string, number>;
  waiters: Map<string, ((frameId: number | undefined) => void)[]>;
}

const sessions = new Map<number, Session>();

function key(path: readonly string[]): string {
  return JSON.stringify(path);
}

function newSession(): Session {
  // INVARIANT: the top frame is always frame 0.
  return { frames: new Map([[key([]), 0]]), waiters: new Map() };
}

function settleWaiters(session: Session) {
  for (const waiters of session.waiters.values()) {
    for (const resolve of waiters) resolve(undefined);
  }
}

/** Starts a new hint session in the tab, dropping the previous table. */
export function reset(tabId: number): void {
  const old = sessions.get(tabId);
  if (old) settleWaiters(old);
  sessions.set(tabId, newSession());
}

export function end(tabId: number): void {
  const old = sessions.get(tabId);
  if (old) settleWaiters(old);
  sessions.delete(tabId);
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
 * Resolves as soon as the frame at `path` has reported, or to undefined after
 * a timeout. A request can overtake the path report of a frame whose content
 * script has only just started (#95, #109).
 */
export function lookup(
  tabId: number,
  path: readonly string[],
  timeoutMs = LOOKUP_TIMEOUT_MS,
): Promise<number | undefined> {
  const session = sessions.get(tabId);
  if (!session) return Promise.resolve(undefined);
  const k = key(path);
  const known = session.frames.get(k);
  if (known != null) return Promise.resolve(known);

  const { promise, resolve } = Promise.withResolvers<number | undefined>();
  const waiters = session.waiters.get(k) ?? [];
  session.waiters.set(k, waiters);
  const timer = setTimeout(() => {
    const i = waiters.indexOf(settle);
    if (i >= 0) waiters.splice(i, 1);
    resolve(undefined);
  }, timeoutMs);
  function settle(frameId: number | undefined) {
    clearTimeout(timer);
    resolve(frameId);
  }
  waiters.push(settle);
  return promise;
}
