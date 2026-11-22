import { Router, sendToTab } from "../lib/chrome-messages";
import { printError } from "../lib/errors";
import * as framePaths from "./frame-paths";
import { requireTabId } from "./sender-guards";

/* WHY: fire-and-forget; a sync failure must not fail the RPC the initiating
   frame awaits. */
function syncHintingState(
  tabId: number,
  state: { active: true; sessionId: string } | { active: false },
) {
  sendToTab(tabId, "SyncHintingState", state).catch(printError);
}

export const router = Router.newRuntimeInstance()
  .add("AttachHints", async ({ sessionId }, sender) => {
    const tabId = requireTabId(sender);
    framePaths.reset(tabId);
    /* WHY: dispatch before awaiting; see SyncHintingState in chrome-messages.ts. */
    syncHintingState(tabId, { active: true, sessionId });
    try {
      return await sendToTab(tabId, "AttachHintsInTab", undefined, {
        frameId: 0,
      });
    } catch (e) {
      syncHintingState(tabId, { active: false });
      framePaths.end(tabId);
      throw e;
    }
  })
  .add("HitHint", async ({ key }, sender) => {
    return await sendToTab(
      requireTabId(sender),
      "HitHintInTab",
      { key },
      {
        frameId: 0,
      },
    );
  })
  .add("CycleHint", async (_msg, sender) => {
    return await sendToTab(requireTabId(sender), "CycleHintInTab", undefined, {
      frameId: 0,
    });
  })
  .add("RemoveHints", async ({ options, execute }, sender) => {
    const tabId = requireTabId(sender);
    syncHintingState(tabId, { active: false });
    framePaths.end(tabId);
    return await sendToTab(
      tabId,
      "RemoveHintsInTab",
      { options, execute },
      { frameId: 0 },
    );
  });
