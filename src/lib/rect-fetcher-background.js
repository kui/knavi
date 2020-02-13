import { recieve, sendTo } from "./chrome-messages";

// import type { DescriptionsRequest, ActionRequest } from "./rect-fetcher-client";


recieve("GetFrameId", (m, sender, responseCallback) => responseCallback(sender.frameId));

// proxy RectsFragmentResponse
recieve("RectsFragmentResponse", async (message, sender, sendResponse) => {
  await sendTo(message, sender.tab.id, message.clientFrameId);
  sendResponse();
});

// proxy DescriptionsRequest/ActionRequest
["DescriptionsRequest", "ActionRequest"].forEach(type => {
  recieve(type, async (message, sender, sendResponse) => {
    const r = await sendTo(message, sender.tab.id, message.frameId);
    sendResponse(r);
  });
});