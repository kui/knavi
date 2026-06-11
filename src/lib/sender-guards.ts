export function requireTabId(sender: chrome.runtime.MessageSender): number {
  const id = sender.tab?.id;
  if (id == null)
    throw Error(
      "This message must be sent from a content script (sender.tab.id is missing)",
    );
  return id;
}

export function requireFrameId(sender: chrome.runtime.MessageSender): number {
  const id = sender.frameId;
  if (id == null)
    throw Error(
      "This message must be sent from a content script (sender.frameId is missing)",
    );
  return id;
}
