import { Router, sendToTab } from "../lib/chrome-messages";

function requireTabId(sender: chrome.runtime.MessageSender): number {
  const id = sender.tab?.id;
  if (id == null)
    throw Error(
      "This message must be sent from a content script (no sender.tab.id)",
    );
  return id;
}

function requireFrameId(sender: chrome.runtime.MessageSender): number {
  const id = sender.frameId;
  if (id == null)
    throw Error(
      "This message must be sent from a content script (no sender.frameId)",
    );
  return id;
}

export const router = Router.newInstance()
  .add("GetFrameId", (_, sender) => requireFrameId(sender))

  .add("ResponseRectsFragment", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ResponseRectsFragment", message, {
      frameId: 0,
    });
  })

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  });
