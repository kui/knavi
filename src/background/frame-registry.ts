import { Router } from "../lib/chrome-messages";
import { requireFrameId, requireTabId } from "./sender-guards";

// Per-tab map: childFrameId → parentFrameId
const registry = new Map<number, Map<number, number>>();

function getTabRegistry(tabId: number): Map<number, number> {
  let m = registry.get(tabId);
  if (!m) {
    m = new Map();
    registry.set(tabId, m);
  }
  return m;
}

export function getParentFrameId(
  tabId: number,
  childFrameId: number,
): number | undefined {
  return registry.get(tabId)?.get(childFrameId);
}

// True iff childFrameId is registered as a direct child of parentFrameId in tabId.
// Used to authenticate RelayFetchRects so a frame can only relay into its own children.
export function isRegisteredChild(
  tabId: number,
  parentFrameId: number,
  childFrameId: number,
): boolean {
  return registry.get(tabId)?.get(childFrameId) === parentFrameId;
}

export const router = Router.newInstance()
  .add("GetFrameId", (_payload, sender) => requireFrameId(sender))
  .add("RegisterChildFrame", ({ childFrameId }, sender) => {
    const tabId = requireTabId(sender);
    const parentFrameId = requireFrameId(sender);
    getTabRegistry(tabId).set(childFrameId, parentFrameId);
  });

// Port-based lifecycle: remove frame from registry when its content script unloads.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "knavi-frame") return;
  const sender = port.sender;
  if (!sender?.tab?.id || sender.frameId == null) return;
  const tabId = sender.tab.id;
  const frameId = sender.frameId;

  port.onDisconnect.addListener(() => {
    const tabRegistry = registry.get(tabId);
    if (!tabRegistry) return;
    tabRegistry.delete(frameId);
    if (tabRegistry.size === 0) {
      registry.delete(tabId);
    }
  });
});

// Clean up entire tab entry on tab close.
chrome.tabs.onRemoved.addListener((tabId) => {
  registry.delete(tabId);
});
