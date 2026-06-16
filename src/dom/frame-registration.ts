import { sendToRuntime } from "../lib/chrome-messages";
import { printWarn } from "../lib/errors";

const KNAVI_FRAME_ID_MSG = "knavi:frame-id";

interface KnaviFrameIdMessage {
  type: typeof KNAVI_FRAME_ID_MSG;
  frameId: number;
}

function isKnaviFrameIdMessage(data: unknown): data is KnaviFrameIdMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).type === KNAVI_FRAME_ID_MSG &&
    typeof (data as Record<string, unknown>).frameId === "number"
  );
}

// Called by each child frame on startup: get own frameId and announce it to parent.
export async function registerWithParent(): Promise<void> {
  if (parent === window) return;
  const frameId = await sendToRuntime("GetFrameId");
  parent.postMessage({ type: KNAVI_FRAME_ID_MSG, frameId }, "*");
}

// Listen for children's frameId announcements, fill iframeMap, and
// report each new child to the background frame registry.
export function listenForChildFramesAndRegister(
  iframeMap: Map<number, HTMLIFrameElement>,
): void {
  listenForChildFrames(iframeMap, true);
}

// Listen for children's frameId announcements and fill iframeMap
// without notifying the background. Use from the root frame, which
// receives background-level registration from its direct children via content-all.ts.
export function listenForChildFramesLocal(
  iframeMap: Map<number, HTMLIFrameElement>,
): void {
  listenForChildFrames(iframeMap, false);
}

function listenForChildFrames(
  iframeMap: Map<number, HTMLIFrameElement>,
  notify: boolean,
): void {
  window.addEventListener("message", (event) => {
    if (!isKnaviFrameIdMessage(event.data)) return;
    const { frameId } = event.data;
    const iframe = findIframeBySource(event.source);
    if (!iframe) return;
    iframeMap.set(frameId, iframe);
    if (notify) {
      sendToRuntime("RegisterChildFrame", { childFrameId: frameId }).catch(
        printWarn,
      );
    }
  });
}

const sourceToIframe = new WeakMap<MessageEventSource, HTMLIFrameElement>();

function findIframeBySource(
  source: MessageEventSource | null,
): HTMLIFrameElement | null {
  if (!source) return null;
  const cached = sourceToIframe.get(source);
  if (cached) return cached;

  for (const iframe of document.querySelectorAll("iframe")) {
    const win = iframe.contentWindow;
    if (!win) continue;
    sourceToIframe.set(win, iframe);
    if (win === source) return iframe;
  }
  return null;
}
