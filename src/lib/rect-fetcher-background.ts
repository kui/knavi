import { Router, sendToTab } from "./chrome-messages";

export const router = Router.newInstance()
  .add("GetFrameId", (_, sender) => sender.frameId!)

  .add("ResponseRectsFragment", async (message, sender) => {
    await sendToTab(sender.tab!.id!, "ResponseRectsFragment", message, {
      frameId: 0,
    });
  })

  .addAll(
    ["GetDescriptions", "ExecuteAction"],
    (type) => async (message, sender) => {
      return await sendToTab(sender.tab!.id!, type, message, {
        frameId: message.frameId,
      });
    },
  );
