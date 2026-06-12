import { Router } from "../lib/chrome-messages";

// tabId → (frameId → childNonce)
// Each content-all frame registers its childNonce here at startup so that child
// frames can retrieve it via GetParentNonce before any hint cycle occurs.
//
// INVARIANT: a frame's nonce may only travel in messages posted TO the window
// that owns it (i.e. upward, child → parent). window.postMessage payloads are
// readable by the receiving page's own (main-world) scripts, so a nonce leaks
// to whichever page it is delivered to; that is harmless only as long as the
// recipient already owns it. Never include a parent's nonce in any message
// posted to a child window (e.g. AllRectsRequest) — that would hand it to an
// untrusted page and allow forged Blur messages. Distribute nonces exclusively
// via chrome.runtime (this router), which page scripts cannot observe.
const nonces = new Map<number, Map<number, string>>();

chrome.tabs.onRemoved.addListener((tabId) => {
  nonces.delete(tabId);
});

export const router = Router.newInstance()
  .add("RegisterFrameNonce", ({ nonce }, sender) => {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    if (tabId == null || frameId == null)
      throw Error("RegisterFrameNonce must be sent from a content script");
    let tabMap = nonces.get(tabId);
    if (!tabMap) {
      tabMap = new Map();
      nonces.set(tabId, tabMap);
    }
    tabMap.set(frameId, nonce);
  })
  .add("GetParentNonce", ({ parentFrameId }, sender) => {
    const tabId = sender.tab?.id;
    if (tabId == null || parentFrameId < 0) return null;
    return nonces.get(tabId)?.get(parentFrameId) ?? null;
  });
