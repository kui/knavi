import { sendToRuntime } from "../lib/chrome-messages";
import { printError } from "../lib/errors";
import { filter, first } from "../lib/iters";

const ANNOUNCEMENT_TYPE = "com.github.kui.knavi.FrameIdAnnouncement";
const PARENT_RESPONSE_TYPE = "com.github.kui.knavi.ParentFrameIdResponse";

interface FrameIdAnnouncement {
  "@type": typeof ANNOUNCEMENT_TYPE;
  frameId: number;
}

interface ParentFrameIdResponse {
  "@type": typeof PARENT_RESPONSE_TYPE;
  parentFrameId: number;
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
      // postMessage call (a race that "*" avoids with no real downside here).
      parent.postMessage(
        { "@type": ANNOUNCEMENT_TYPE, frameId } satisfies FrameIdAnnouncement,
        "*",
      );
    })
    .catch(printError);
}

// Sets up all frame-registration logic: builds the iframe Maps, registers the
// onChildFrameId listener, and announces this frame's own frameId to its
// parent (no-op in the root frame). The parent replies with its own frameId
// via ParentFrameIdResponse so this frame can hold its parentFrameId without
// any background-side registry.
export function setupFrameRegistration(): {
  iframeByFrameId: Map<number, HTMLIFrameElement>;
  iframeToFrameId: Map<HTMLIFrameElement, number>;
  parentFrameIdPromise: Promise<number | undefined>;
} {
  const myFrameIdPromise = sendToRuntime("GetFrameId", undefined);

  const iframeByFrameId = new Map<number, HTMLIFrameElement>();
  const iframeToFrameId = new Map<HTMLIFrameElement, number>();

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
    iframeByFrameId.set(data.frameId, iframe);
    iframeToFrameId.set(iframe, data.frameId);

    // Reply with our own frameId so the child can store its parentFrameId.
    myFrameIdPromise
      .then((parentFrameId) => {
        source.postMessage(
          {
            "@type": PARENT_RESPONSE_TYPE,
            parentFrameId,
          } satisfies ParentFrameIdResponse,
          "*",
        );
      })
      .catch(printError);
  });

  // Resolve parentFrameId from the parent's response in non-root frames.
  const parentFrameIdPromise: Promise<number | undefined> =
    parent === window
      ? Promise.resolve(undefined)
      : new Promise((resolve) => {
          const handler = (e: MessageEvent) => {
            const data = e.data as ParentFrameIdResponse | null | undefined;
            if (data?.["@type"] !== PARENT_RESPONSE_TYPE) return;
            window.removeEventListener("message", handler);
            resolve(data.parentFrameId);
          };
          window.addEventListener("message", handler);
        });

  announceFrameIdToParent();

  return { iframeByFrameId, iframeToFrameId, parentFrameIdPromise };
}
