import { Router, sendToTab } from "../lib/chrome-messages";
import { printDebug } from "../lib/errors";
import { requireFrameId, requireTabId } from "./sender-guards";

// tabId → (childFrameId → parentFrameId)
const registry = new Map<number, Map<number, number>>();

export function getParentFrameId(
  tabId: number,
  childFrameId: number,
): number | undefined {
  return registry.get(tabId)?.get(childFrameId);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "frame-lifetime") return;
  port.onDisconnect.addListener(() => {
    const tabId = port.sender?.tab?.id;
    const childFrameId = port.sender?.frameId;
    if (tabId == null || childFrameId == null) return;
    const parentFrameId = getParentFrameId(tabId, childFrameId);
    registry.get(tabId)?.delete(childFrameId);
    if (parentFrameId == null) return;
    // Failures here mean the parent frame/tab is already gone (tab close,
    // ancestor frame destroyed). The message is a cleanup hint, so a missing
    // receiver means "no cleanup needed" — log at debug level only.
    sendToTab(
      tabId,
      "UnregisterChildFrame",
      { childFrameId },
      { frameId: parentFrameId },
    ).catch(printDebug);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  registry.delete(tabId);
});

export const router = Router.newInstance().add(
  "RegisterChildFrame",
  ({ childFrameId }, sender) => {
    const tabId = requireTabId(sender);
    const parentFrameId = requireFrameId(sender);
    if (!registry.has(tabId)) registry.set(tabId, new Map());
    registry.get(tabId)!.set(childFrameId, parentFrameId);
  },
);
