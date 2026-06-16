import { Router, sendToTab } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "./sender-guards";
import { getParentFrameId } from "./frame-registry";

export const router = Router.newInstance().add(
  "BlurUp",
  async ({ rect }, sender) => {
    const tabId = requireTabId(sender);
    const childFrameId = requireFrameId(sender);

    // Root frame (frameId 0) blurs itself; others relay to their parent.
    const targetFrameId =
      childFrameId === 0 ? 0 : getParentFrameId(tabId, childFrameId);
    if (targetFrameId === undefined) {
      console.warn(`Unregistered frame ${childFrameId} sent BlurUp; dropping`);
      return;
    }

    await sendToTab(
      tabId,
      "BlurRelay",
      { childFrameId, rect },
      { frameId: targetFrameId },
    );
  },
);
