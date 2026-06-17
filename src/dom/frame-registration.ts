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
      // "*" is intentional: frameId is meaningless outside the extension, so
      // there is no sensitive data to protect. Using ancestorOrigins[0] would
      // risk a silent drop if the parent navigates between GetFrameId and the
      // postMessage call (a race that "* " avoids with no real downside here).
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
    // MessageEventSource = Window | MessagePort | ServiceWorker.
    // Duck-type via `"window" in source`: `window` is on the cross-origin
    // property allowlist (so `in` never throws SecurityError), and only Window
    // has it — MessagePort and ServiceWorker do not. Avoids `instanceof
    // ServiceWorker`, which throws ReferenceError in insecure contexts (http).
    const source = e.source;
    if (!source || !("window" in source)) return;
    callback(data.frameId, source);
  });
}
