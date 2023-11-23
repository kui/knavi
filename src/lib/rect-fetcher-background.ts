import { Router, sendToTab } from "./chrome-messages";

export const router = Router.newInstance()
  .add("GetFrameId", (message, sender, sendResponse) =>
    sendResponse(sender.frameId!),
  )

  // proxy ResponseRectsFragment
  .add("ResponseRectsFragment", async (message, sender, sendResponse) => {
    await sendToTab(sender.tab!.id!, "ResponseRectsFragment", message, {
      frameId: message.clientFrameId,
    });
    sendResponse();
  })

  .addAll(
    ["GetDescriptions", "ExecuteAction"],
    (type) => async (message, sender, sendResponse) => {
      const r = await sendToTab(sender.tab!.id!, type, message, {
        frameId: message.frameId,
      });
      sendResponse(r);
    },
  );
