import { Router } from "../lib/chrome-messages";
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
    const frameId = port.sender?.frameId;
    if (tabId == null || frameId == null) return;
    registry.get(tabId)?.delete(frameId);
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
