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
            { senderFrameId, targetFrameId, registeredParent },
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
    const childFrameId = requireFrameId(sender);
    const parentFrameId = getParentFrameId(tabId, childFrameId);
    if (parentFrameId == null) {
      // No registered parent — treat as root frame, deliver BlurRoot to frameId=0.
      await sendToTab(tabId, "BlurRoot", { rect }, { frameId: 0 });
    } else {
      await sendToTab(
        tabId,
        "BlurRelay",
        { childFrameId, rect },
        { frameId: parentFrameId },
      );
    }
  });
