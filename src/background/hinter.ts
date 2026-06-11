import { Router, sendToTab } from "../lib/chrome-messages";

function requireTabId(sender: chrome.runtime.MessageSender): number {
  const id = sender.tab?.id;
  if (id == null)
    throw Error(
      "This message must be sent from a content script (no sender.tab.id)",
    );
  return id;
}

export const router = Router.newInstance().addAll(
  ["AttachHints", "RemoveHints", "HitHint"],
  (type) => async (msg, sender) => {
    return await sendToTab(requireTabId(sender), type, msg, { frameId: 0 });
  },
);
