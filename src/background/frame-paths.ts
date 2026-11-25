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

interface Table {
  frames: Map<string, number>;
  waiters: Map<string, Waiter[]>;
}

interface Tab {
  /**
   * The session whose table takes path reports. Other tables hold lookups of
   * a session whose table has not started yet: it starts only once
   * content-root has accepted the session, and frame 0 can already be
   * requesting its child frames' rects by then.
   */
  live: SessionId | null;
  tables: Map<SessionId, Table>;
}

const tabs = new Map<number, Tab>();

function key(path: readonly string[]): string {
  return JSON.stringify(path);
}

function tabOf(tabId: number): Tab {
  let tab = tabs.get(tabId);
  if (!tab) {
    tab = { live: null, tables: new Map() };
    tabs.set(tabId, tab);
  }
  return tab;
}

function tableOf(tab: Tab, sessionId: SessionId): Table {
  let table = tab.tables.get(sessionId);
  if (!table) {
    table = { frames: new Map(), waiters: new Map() };
    tab.tables.set(sessionId, table);
  }
  return table;
}

function drop(tab: Tab, sessionId: SessionId) {
  const table = tab.tables.get(sessionId);
  if (!table) return;
  tab.tables.delete(sessionId);
  for (const list of table.waiters.values()) {
    for (const resolve of list) resolve(undefined);
  }
}

function pruneTab(tabId: number, tab: Tab) {
  if (tab.live === null && tab.tables.size === 0) tabs.delete(tabId);
}

/**
 * Starts the table of session `sessionId`, which content-root has accepted,
 * dropping every other one.
 */
export function reset(tabId: number, sessionId: SessionId): void {
  const tab = tabOf(tabId);
  for (const id of tab.tables.keys()) {
    if (id !== sessionId || tab.live === sessionId) drop(tab, id);
  }
  tab.live = sessionId;
  tableOf(tab, sessionId);
}

/** Drops the table if it belongs to session `sessionId`. */
export function end(tabId: number, sessionId: SessionId): void {
  const tab = tabs.get(tabId);
  if (tab?.live == null) return;
  if (tab.live !== sessionId) {
    console.debug(
      "Keep the frame paths of",
      tab.live,
      "on the end of",
      sessionId,
    );
    return;
  }
  tab.live = null;
  drop(tab, sessionId);
  pruneTab(tabId, tab);
}

/** Drops everything kept for the tab, whichever session it belongs to. */
export function forgetTab(tabId: number): void {
  const tab = tabs.get(tabId);
  if (!tab) return;
  tabs.delete(tabId);
  for (const id of tab.tables.keys()) drop(tab, id);
}

/** Ignored outside a hint session, so a late report cannot leak a table. */
export function report(
  tabId: number,
  path: readonly string[],
  frameId: number,
): void {
  const tab = tabs.get(tabId);
  const table = tab?.live == null ? undefined : tab.tables.get(tab.live);
  if (!table) return;
  if (path.length === 0) {
    if (frameId !== 0) {
      console.debug("Frame", frameId, "reported the top frame's path");
    }
    return;
  }
  const k = key(path);
  const registered = table.frames.get(k);
  if (registered != null && registered !== frameId) {
    console.debug("Frame", frameId, "reported", path, "held by", registered);
    return;
  }
  table.frames.set(k, frameId);
  const waiters = table.waiters.get(k);
  table.waiters.delete(k);
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
  // INVARIANT: the top frame is always frame 0.
  if (path.length === 0) return Promise.resolve(0);
  const tab = tabOf(tabId);
  // WHY: session ids only grow within a tab, so this session has ended.
  if (tab.live !== null && tab.live > sessionId) {
    return Promise.resolve(undefined);
  }
  const table = tableOf(tab, sessionId);
  const k = key(path);
  const known = table.frames.get(k);
  if (known != null) return Promise.resolve(known);

  const { promise, resolve } = Promise.withResolvers<number | undefined>();
  const waiters = table.waiters.get(k) ?? [];
  table.waiters.set(k, waiters);
  const timer = setTimeout(() => {
    const i = waiters.indexOf(settle);
    if (i >= 0) waiters.splice(i, 1);
    if (waiters.length === 0 && table.waiters.get(k) === waiters) {
      table.waiters.delete(k);
    }
    if (
      tab.live !== sessionId &&
      table.waiters.size === 0 &&
      tab.tables.get(sessionId) === table
    ) {
      tab.tables.delete(sessionId);
      if (tabs.get(tabId) === tab) pruneTab(tabId, tab);
    }
    resolve(undefined);
  }, timeoutMs);
  function settle(frameId: number | undefined) {
    clearTimeout(timer);
    resolve(frameId);
  }
  waiters.push(settle);
  return promise;
}
