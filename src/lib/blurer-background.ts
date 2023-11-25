import { Router, sendToTab } from "./chrome-messages";

export const router = Router.newInstance().add(
  "AfterBlur",
  async (message, sender) => {
    await sendToTab(sender.tab!.id!, "AfterBlur", message, {
      frameId: 0,
    });
  },
);
