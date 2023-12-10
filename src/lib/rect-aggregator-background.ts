import { Router, sendToTab } from "./chrome-messages";

export const router = Router.newInstance()
  .add("GetFrameId", (_, sender) => sender.frameId!)

  .add("ResponseRectsFragment", async (message, sender) => {
    await sendToTab(sender.tab!.id!, "ResponseRectsFragment", message, {
      frameId: 0,
    });
  })

  .add("ExecuteAction", async (message, sender) => {
    return await sendToTab(sender.tab!.id!, "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  });
