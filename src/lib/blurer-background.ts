import { Router, sendToTab } from "./chrome-messages";

export const router = Router.newInstance().add(
  "AfterBlur",
  async (message, sender, sendResponse) => {
    await sendToTab(sender.tab!.id!, "AfterBlur", message, {
      frameId: 0,
    });
    sendResponse();
  },
);
