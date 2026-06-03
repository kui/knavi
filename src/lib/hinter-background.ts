import { Router, sendToTab } from "./chrome-messages.ts";

export const router = Router.newInstance().addAll(
  ["AttachHints", "RemoveHints", "HitHint"],
  (type) => async (msg, sender) => {
    return await sendToTab(sender.tab!.id!, type, msg, { frameId: 0 });
  },
);
