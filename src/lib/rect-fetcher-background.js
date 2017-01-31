// @flow

import { recieve, sendTo } from "./chrome-messages";

// import type { DescriptionsRequest, ActionRequest } from "./rect-fetcher-client";
import type { RectsFragmentResponse } from "./rect-fetcher-service";

recieve("GetFrameId", (m, sender, responseCallback) => responseCallback(sender.frameId));

// proxy RectsFragmentResponse
recieve("RectsFragmentResponse", async (message: RectsFragmentResponse, sender, sendResponse) => {
  await sendTo(message, sender.tab.id, message.clientFrameId);
  sendResponse();
});

// proxy DescriptionsRequest/ActionRequest
["DescriptionsRequest", "ActionRequest"].forEach((type) => {
  recieve(type, async (message: { type: string, frameId: number }, sender, sendResponse) => {
    const r = await sendTo(message, sender.tab.id, message.frameId);
    sendResponse(r);
  });
});
