import { Router, sendToTab } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "./sender-guards";

export const router = Router.newInstance()
  .add("GetFrameId", (_, sender) => requireFrameId(sender))

  .add("ResponseRectsFragment", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ResponseRectsFragment", message, {
      frameId: 0,
    });
  })

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ExecuteActionInFrame", message, {
      frameId: message.id.frameId,
    });
  })

  .add(
    "AllRectsRequest",
    async ({ id, targetFrameId, viewport, offsets }, sender) => {
      const tabId = requireTabId(sender);
      await sendToTab(
        tabId,
        "AllRectsRequest",
        { id, targetFrameId, viewport, offsets },
        { frameId: targetFrameId },
      );
    },
  )

  .add("BlurUp", async ({ parentFrameId, rect }, sender) => {
    const tabId = requireTabId(sender);
    const senderFrameId = requireFrameId(sender);
    if (parentFrameId === 0 && senderFrameId === 0) {
      await sendToTab(tabId, "BlurRoot", { rect }, { frameId: 0 });
      return;
    }
    await sendToTab(
      tabId,
      "BlurRelay",
      { childFrameId: senderFrameId, rect },
      { frameId: parentFrameId },
    );
  });
