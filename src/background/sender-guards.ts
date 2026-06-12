export function requireTabId(sender: chrome.runtime.MessageSender): number {
  const id = sender.tab?.id;
  if (id == null)
    throw Error(
      "This message must be sent from a content script (no sender.tab.id)",
    );
  return id;
}

export function requireFrameId(sender: chrome.runtime.MessageSender): number {
  const id = sender.frameId;
  if (id == null)
    throw Error(
      "This message must be sent from a content script (no sender.frameId)",
    );
  return id;
}
