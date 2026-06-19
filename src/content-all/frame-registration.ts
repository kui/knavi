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

// Tracks child iframe ↔ frameId mappings via postMessage handshake and resolves
// this frame's parentFrameId. The only place in the codebase that still uses
// window.postMessage cross-frame, because frameId is needed before any
// chrome.runtime relay can address the parent/child by frameId.
export class FrameRegistry {
  private readonly iframeByFrameId = new Map<number, HTMLIFrameElement>();
  private readonly iframeToFrameId = new Map<HTMLIFrameElement, number>();
  private readonly myFrameIdPromise = sendToRuntime("GetFrameId", undefined);
  private readonly parentFrameIdResolvers = Promise.withResolvers<
    number | undefined
  >();

  constructor() {
    if (parent === window) {
      this.parentFrameIdResolvers.resolve(undefined);
    } else {
      this.myFrameIdPromise
        .then((frameId) => {
          parent.postMessage(
            {
              "@type": ANNOUNCEMENT_TYPE,
              frameId,
            } satisfies FrameIdAnnouncement,
            "*", // intentional: avoids silent drop if the parent navigates mid-flight.
          );
        })
        .catch(printError);
    }
  }

  get parentFrameId(): Promise<number | undefined> {
    return this.parentFrameIdResolvers.promise;
  }

  getIframe(frameId: number): HTMLIFrameElement | undefined {
    return this.iframeByFrameId.get(frameId);
  }

  getFrameId(iframe: HTMLIFrameElement): number | undefined {
    return this.iframeToFrameId.get(iframe);
  }

  readonly handleMessage = (e: MessageEvent): void => {
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
      this.purgeDisconnectedIframes();
      this.iframeByFrameId.set(data.frameId, iframe);
      this.iframeToFrameId.set(iframe, data.frameId);

      // Reply with our own frameId so the child can store its parentFrameId.
      this.myFrameIdPromise
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
      if (e.source !== parent) return;
      this.parentFrameIdResolvers.resolve(data.parentFrameId);
    }
  };

  /**
   * Remove disconnected iframes from the registry.
   *
   * Called on every FrameIdAnnouncement. This is sufficient because child
   * frames are *only* ever registered through this handler; every new
   * announcement triggers cleanup of previously detached ones. A
   * MutationObserver is unnecessary overhead for this use case.
   */
  private purgeDisconnectedIframes(): void {
    for (const [id, el] of this.iframeByFrameId) {
      if (!el.isConnected) {
        this.iframeByFrameId.delete(id);
        this.iframeToFrameId.delete(el);
      }
    }
  }
}
