import { Router, sendToTab } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "./sender-guards";
import { getParentFrameId } from "./frame-registry";

export const router = Router.newInstance()
  .add("GetFrameId", (_, sender) => requireFrameId(sender))

  .add("ResponseRectsFragment", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ResponseRectsFragment", message, {
      frameId: 0,
    });
  })

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  })

  .add(
    "AllRectsRequest",
    async ({ id, targetFrameId, viewport, offsets }, sender) => {
      const tabId = requireTabId(sender);
      const senderFrameId = requireFrameId(sender);
      if (senderFrameId !== targetFrameId) {
        const registeredParent = getParentFrameId(tabId, targetFrameId);
        if (registeredParent !== senderFrameId) {
          console.warn(
            "Unauthorized AllRectsRequest: sender is not registered parent",
            {
              senderFrameId,
              targetFrameId,
              registeredParent,
              senderUrl: sender.url,
            },
          );
          return;
        }
      }
      await sendToTab(
        tabId,
        "AllRectsRequest",
        { id, targetFrameId, viewport, offsets },
        { frameId: targetFrameId },
      );
    },
  )

  .add("BlurUp", async ({ rect }, sender) => {
    const tabId = requireTabId(sender);
    const senderFrameId = requireFrameId(sender);
    if (senderFrameId === 0) {
      await sendToTab(tabId, "BlurRoot", { rect }, { frameId: 0 });
      return;
    }

    const parentFrameId = getParentFrameId(tabId, senderFrameId);
    if (parentFrameId != null) {
      await sendToTab(
        tabId,
        "BlurRelay",
        { childFrameId: senderFrameId, rect },
        { frameId: parentFrameId },
      );
      return;
    }

    console.warn("BlurUp from unregistered non-root frame; dropping", {
      tabId,
      senderFrameId,
      senderUrl: sender.url,
    });
  });
