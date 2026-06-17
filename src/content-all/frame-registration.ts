import { sendToRuntime } from "../lib/chrome-messages";
import { printError } from "../lib/errors";
import { filter, first } from "../lib/iters";

const ANNOUNCEMENT_TYPE = "com.github.kui.knavi.FrameIdAnnouncement";

interface FrameIdAnnouncement {
  "@type": typeof ANNOUNCEMENT_TYPE;
  frameId: number;
}

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

// Sets up all frame-registration logic: builds the iframe Maps, registers the
// onChildFrameId listener, starts the MutationObserver for removed iframes, and
// announces this frame's own frameId to its parent (no-op in the root frame).
// Returns the two Maps so callers (content-all) can pass them to other modules.
export function setupFrameRegistration(): {
  iframeByFrameId: Map<number, HTMLIFrameElement>;
  iframeToFrameId: Map<HTMLIFrameElement, number>;
} {
  // Opens a long-lived port so background can detect frame disconnect.
  // Skipped in the root frame: it never sends RegisterChildFrame, and tab
  // close is handled by chrome.tabs.onRemoved on the background side.
  if (parent !== window) chrome.runtime.connect({ name: "frame-lifetime" });

  const iframeByFrameId = new Map<number, HTMLIFrameElement>();
  const iframeToFrameId = new Map<HTMLIFrameElement, number>();

  onChildFrameId((childFrameId, source) => {
    const iframe = first(
      filter(
        document.getElementsByTagName("iframe"),
        (i) => source === i.contentWindow,
      ),
    );
    if (!iframe) {
      console.warn("FrameIdAnnouncement from unknown source:", source);
      return;
    }
    iframeByFrameId.set(childFrameId, iframe);
    iframeToFrameId.set(iframe, childFrameId);
    sendToRuntime("RegisterChildFrame", { childFrameId }).catch(printError);
  });

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLIFrameElement)) continue;
        const frameId = iframeToFrameId.get(node);
        if (frameId == null) continue;
        iframeToFrameId.delete(node);
        iframeByFrameId.delete(frameId);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  announceFrameIdToParent();

  return { iframeByFrameId, iframeToFrameId };
}
