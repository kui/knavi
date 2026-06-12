import { Router, sendToTab } from "../lib/chrome-messages";
import { requireTabId } from "./sender-guards";

export const router = Router.newInstance().addAll(
  ["AttachHints", "RemoveHints", "HitHint"],
  (type) => async (msg, sender) => {
    return await sendToTab(requireTabId(sender), type, msg, { frameId: 0 });
  },
);
