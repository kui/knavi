import { Router, sendToTab } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "../lib/sender-guards";

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
  });
