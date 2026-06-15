import { Router, sendToTab } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "./sender-guards";
import { getParentFrameId } from "./frame-registry";

export const router = Router.newInstance().add(
  "BlurUp",
  async ({ rect }, sender) => {
    const tabId = requireTabId(sender);
    const childFrameId = requireFrameId(sender);

    // Root frame (frameId 0) is never registered as a child, so look it up
    // explicitly rather than falling through via a `?? 0` default.
    const parentFrameId =
      childFrameId === 0 ? 0 : (getParentFrameId(tabId, childFrameId) ?? 0);

    await sendToTab(
      tabId,
      "BlurRelay",
      { childFrameId, rect },
      { frameId: parentFrameId },
    );
  },
);
