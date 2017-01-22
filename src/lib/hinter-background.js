// @flow

// import type { AttachHints, RemoveHints, HitHint } from "./hinter-client";

// Proxy messages to the root frame.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (["AttachHints", "RemoveHints", "HitHint"].includes(message.type)) {
    chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 });
    return true;
  }
});
