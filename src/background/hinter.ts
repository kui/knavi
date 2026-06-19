import { Router, sendToTab } from "../lib/chrome-messages";
import { requireTabId } from "./sender-guards";

export const router = Router.newInstance()
  .add("AttachHints", async (msg, sender) => {
    return await sendToTab(requireTabId(sender), "AttachHintsInTab", msg, {
      frameId: 0,
    });
  })
  .add("HitHint", async (msg, sender) => {
    return await sendToTab(requireTabId(sender), "HitHintInTab", msg, {
      frameId: 0,
    });
  })
  .add("RemoveHints", async (msg, sender) => {
    return await sendToTab(requireTabId(sender), "RemoveHintsInTab", msg, {
      frameId: 0,
    });
  });
