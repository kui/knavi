import { Router, sendToTab } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "./sender-guards";
import { getParentFrameId } from "./frame-registry";

export const router = Router.newInstance()
  .add("InitRects", async ({ viewport, frameOffsets }, sender) => {
    const tabId = requireTabId(sender);
    return sendToTab(
      tabId,
      "FetchRects",
      { viewport, frameOffsets },
      { frameId: 0 },
    );
  })

  .add(
    "RelayFetchRects",
    async ({ childFrameId, viewport, frameOffsets }, sender) => {
      const tabId = requireTabId(sender);
      const parentFrameId = requireFrameId(sender);
      const registeredParent = getParentFrameId(tabId, childFrameId);
      if (registeredParent !== parentFrameId) {
        throw new Error(
          `Frame ${childFrameId} is not a registered child of ${parentFrameId}`,
        );
      }
      return sendToTab(
        tabId,
        "FetchRects",
        { viewport, frameOffsets },
        { frameId: childFrameId },
      );
    },
  )

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  });
