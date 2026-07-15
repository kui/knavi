import { Router, sendToTab } from "../lib/chrome-messages";
import { printError } from "../lib/errors";
import { requireTabId } from "./sender-guards";

/* WHY: fire-and-forget; a sync failure must not fail the RPC the initiating
   frame awaits. */
function syncHintingState(tabId: number, active: boolean) {
  sendToTab(tabId, "SyncHintingState", { active }).catch(printError);
}

export const router = Router.newRuntimeInstance()
  .add("AttachHints", async (_msg, sender) => {
    const tabId = requireTabId(sender);
    /* WHY: dispatch before awaiting; see SyncHintingState in chrome-messages.ts. */
    syncHintingState(tabId, true);
    try {
      return await sendToTab(tabId, "AttachHintsInTab", undefined, {
        frameId: 0,
      });
    } catch (e) {
      syncHintingState(tabId, false);
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
    syncHintingState(tabId, false);
    return await sendToTab(
      tabId,
      "RemoveHintsInTab",
      { options, execute },
      { frameId: 0 },
    );
  });
