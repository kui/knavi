import { Router, sendToTab } from "../lib/chrome-messages";
import type { SessionId } from "../lib/chrome-messages";
import { printError } from "../lib/errors";
import * as framePaths from "./frame-paths";
import { requireTabId } from "./sender-guards";

/* WHY: fire-and-forget; a sync failure must not fail the RPC the initiating
   frame awaits. */
function syncHintingState(
  tabId: number,
  active: boolean,
  sessionId: SessionId,
) {
  sendToTab(tabId, "SyncHintingState", { active, sessionId }).catch(printError);
}

/* WHY: the session state lives in content-root, not here, because this
   service worker can be stopped in the middle of a session. Content-root
   ignores a message whose sessionId is not the live session. */
export const router = Router.newRuntimeInstance()
  .add("AttachHints", async (_msg, sender) => {
    const tabId = requireTabId(sender);
    /* WHY: a rejected attach (e.g. "already started hinting" while another
       frame's session is live) announced nothing, so it broadcasts nothing;
       a false here would end the live session in every frame. */
    const { sessionId } = await sendToTab(
      tabId,
      "AttachHintsInTab",
      undefined,
      { frameId: 0 },
    );
    /* WHY: reset only once content-root has accepted, so a rejected attach
       keeps the live session's table. Frames report their paths on the true
       broadcast, which follows. */
    framePaths.reset(tabId, sessionId);
    syncHintingState(tabId, true, sessionId);
    return { sessionId };
  })
  .add("HitHint", async ({ sessionId, key }, sender) => {
    return await sendToTab(
      requireTabId(sender),
      "HitHintInTab",
      { sessionId, key },
      { frameId: 0 },
    );
  })
  .add("CycleHint", async ({ sessionId }, sender) => {
    return await sendToTab(
      requireTabId(sender),
      "CycleHintInTab",
      { sessionId },
      { frameId: 0 },
    );
  })
  .add("RemoveHints", async ({ sessionId, options, execute }, sender) => {
    const tabId = requireTabId(sender);
    syncHintingState(tabId, false, sessionId);
    framePaths.end(tabId, sessionId);
    return await sendToTab(
      tabId,
      "RemoveHintsInTab",
      { sessionId, options, execute },
      { frameId: 0 },
    );
  });
