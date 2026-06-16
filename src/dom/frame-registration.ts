import { sendToRuntime } from "../lib/chrome-messages";
import { printError } from "../lib/errors";

const ANNOUNCEMENT_TYPE = "com.github.kui.knavi.FrameIdAnnouncement";

interface FrameIdAnnouncement {
  "@type": typeof ANNOUNCEMENT_TYPE;
  frameId: number;
}

// Opens a long-lived port so background can detect frame disconnect.
chrome.runtime.connect({ name: "frame-lifetime" });

// Gets own frameId via chrome.runtime and announces it to the parent frame via postMessage.
// Only called in non-root frames.
export function announceFrameIdToParent(): void {
  if (parent === window) return;
  sendToRuntime("GetFrameId", undefined)
    .then((frameId) => {
      parent.postMessage(
        { "@type": ANNOUNCEMENT_TYPE, frameId } satisfies FrameIdAnnouncement,
        "*",
      );
    })
    .catch(printError);
}

// Registers a listener that fires whenever a child iframe announces its frameId.
// `source` is the child's window, usable to find the corresponding iframe element.
export function onChildFrameId(
  callback: (childFrameId: number, source: Window) => void,
): void {
  window.addEventListener("message", (e: MessageEvent) => {
    const data = e.data as FrameIdAnnouncement | null | undefined;
    if (data?.["@type"] !== ANNOUNCEMENT_TYPE) return;
    if (!(e.source instanceof Window)) return;
    callback(data.frameId, e.source);
  });
}
