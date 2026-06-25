import { listIframesInShadowRoots } from "../dom/elements";
import { sendToRuntime } from "../lib/chrome-messages";
import { printError } from "../lib/errors";

// Locate the iframe element whose contentWindow is `source`.
// Tiered to avoid a full DOM walk in the common case:
//   0. `source.closed` — skip everything for dead windows (stale messages from
//      removed iframes / bfcache); no point scanning the DOM for a corpse.
//   1. `source.frameElement` — O(1), reaches through shadow boundaries when
//      same-origin. `frameElement` is NOT on the cross-origin property
//      allowlist, so reading it on a cross-origin Window throws SecurityError;
//      swallow and fall through to the DOM-side lookup.
//   2. Live light-DOM HTMLCollection — covers cross-origin iframes that live
//      in the light DOM (the typical ad/embed case).
//   3. Shadow-root walk — last resort for the rare cross-origin iframe that
//      is hosted inside a shadow tree.
function findIframeBySource(source: Window): HTMLIFrameElement | undefined {
  if (source.closed) return undefined;

  try {
    const direct = source.frameElement;
    if (direct?.tagName === "IFRAME") return direct as HTMLIFrameElement;
  } catch {
    // cross-origin source: frameElement access throws; fall through.
  }

  for (const iframe of document.getElementsByTagName("iframe")) {
    if (iframe.contentWindow === source) return iframe;
  }

  for (const iframe of listIframesInShadowRoots()) {
    if (iframe.contentWindow === source) return iframe;
  }

  return undefined;
}

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

      const iframe = findIframeBySource(source);
      if (!iframe) {
        // Reachable in benign cases that we can't disambiguate from real misses:
        // iframes inside closed shadow roots (unreachable via DOM walk), React
        // remount races where `contentWindow` identity is lost mid-handshake,
        // iframe removed mid-flight, src swap, bfcache revival. `source.parent
        // === window` doesn't reliably indicate a real miss either, since the
        // first two cases also satisfy it. Log at debug only.
        console.debug("FrameIdAnnouncement from unknown source:", source);
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
