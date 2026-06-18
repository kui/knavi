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

// Sets up all frame-registration logic: builds the iframe Maps and announces
// this frame's own frameId to its parent (no-op in the root frame). Returns
// an onMessage handler to be registered by the caller, keeping event-hook
// wiring in the entry-point (content-all.ts) consistent with other modules.
export function setupFrameRegistration(): {
  iframeByFrameId: Map<number, HTMLIFrameElement>;
  iframeToFrameId: Map<HTMLIFrameElement, number>;
  parentFrameIdPromise: Promise<number | undefined>;
  handleMessage: (e: MessageEvent) => void;
} {
  const myFrameIdPromise = sendToRuntime("GetFrameId", undefined);

  const iframeByFrameId = new Map<number, HTMLIFrameElement>();
  const iframeToFrameId = new Map<HTMLIFrameElement, number>();

  // Resolve parentFrameId from the parent's response in non-root frames.
  const { promise: parentFrameIdPromise, resolve: resolveParentFrameId } =
    Promise.withResolvers<number | undefined>();
  if (parent === window) {
    resolveParentFrameId(undefined);
  } else {
    myFrameIdPromise
      .then((frameId) => {
        parent.postMessage(
          { "@type": ANNOUNCEMENT_TYPE, frameId } satisfies FrameIdAnnouncement,
          "*", // intentional: avoids silent drop if the parent navigates mid-flight.
        );
      })
      .catch(printError);
  }

  function handleMessage(e: MessageEvent) {
    const data = e.data as
      | FrameIdAnnouncement
      | ParentFrameIdResponse
      | null
      | undefined;

    if (data?.["@type"] === ANNOUNCEMENT_TYPE) {
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
      for (const [id, el] of iframeByFrameId) {
        if (!el.isConnected) {
          iframeByFrameId.delete(id);
          iframeToFrameId.delete(el);
        }
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
    } else if (data?.["@type"] === PARENT_RESPONSE_TYPE) {
      resolveParentFrameId(data.parentFrameId);
    }
  }

  return {
    iframeByFrameId,
    iframeToFrameId,
    parentFrameIdPromise,
    handleMessage,
  };
}
