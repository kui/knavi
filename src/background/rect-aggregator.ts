import { Router, sendToTab } from "../lib/chrome-messages.ts";

export const router = Router.newInstance()
  .add("GetFrameId", (_, sender) => sender.frameId!)

  .add("ResponseRectsFragment", async (message, sender) => {
    await sendToTab(sender.tab!.id!, "ResponseRectsFragment", message, {
      frameId: 0,
    });
  })

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(sender.tab!.id!, "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  });
