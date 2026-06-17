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
      // Expected sender: root bootstraps itself (target 0 ← sender 0);
      // otherwise the registered parent of the target must be the sender.
      const expectedSender =
        targetFrameId === 0 ? 0 : getParentFrameId(tabId, targetFrameId);
      if (senderFrameId !== expectedSender) {
        console.warn("Unauthorized AllRectsRequest", {
          senderFrameId,
          targetFrameId,
          expectedSender,
          senderUrl: sender.url,
        });
        return;
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
