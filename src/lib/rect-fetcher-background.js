// @flow

import type { DescriptionsRequest } from "./rect-fetcher-client";

chrome.runtime.onMessage.addListener((message, sender, responseCallback) => {
  if (message !== "getFrameId") return;
  responseCallback(sender.frameId);
  return true;
});

// proxy RectsFragmentResponse
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "RectsFragmentResponse") return;
  chrome.tabs.sendMessage(sender.tab.id, message, function() { sendResponse(); });
  return true;
});

// proxy DescriptionsRequest/ActionRequest
chrome.runtime.onMessage.addListener((message: DescriptionsRequest, sender, sendResponse) => {
  if (!["DescriptionsRequest", "ActionRequest"].includes(message.type)) return;

  chrome.tabs.sendMessage(
    sender.tab.id,
    message,
    { frameId: message.frameId },
    function(args) { sendResponse(args); },
  );
  return true;
});
