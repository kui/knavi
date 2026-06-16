import { Router, sendToTab } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "./sender-guards";
import { isRegisteredChild } from "./frame-registry";

export const router = Router.newInstance()
  .add("InitRects", async ({ viewport, rootOrigin }, sender) => {
    const tabId = requireTabId(sender);
    return sendToTab(
      tabId,
      "FetchRects",
      { viewport, rootOrigin },
      { frameId: 0 },
    );
  })

  .add(
    "RelayFetchRects",
    async ({ childFrameId, viewport, rootOrigin }, sender) => {
      const tabId = requireTabId(sender);
      const parentFrameId = requireFrameId(sender);
      if (!isRegisteredChild(tabId, parentFrameId, childFrameId)) {
        throw Error(
          `Frame ${parentFrameId} attempted to relay FetchRects to ` +
            `${childFrameId}, which is not a registered child; dropping`,
        );
      }
      return sendToTab(
        tabId,
        "FetchRects",
        { viewport, rootOrigin },
        { frameId: childFrameId },
      );
    },
  )

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  });
