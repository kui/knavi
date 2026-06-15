import { sendToRuntime } from "../lib/chrome-messages";

const KNAVI_FRAME_ID_MSG = "knavi:frame-id";

interface KnaviFrameIdMessage {
  type: typeof KNAVI_FRAME_ID_MSG;
  frameId: number;
}

function isKnaviFrameIdMessage(data: unknown): data is KnaviFrameIdMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).type === KNAVI_FRAME_ID_MSG
  );
}

// Called by each child frame on startup: get own frameId and announce it to parent.
export async function registerWithParent(): Promise<void> {
  if (parent === window) return;
  const frameId = await sendToRuntime("GetFrameId", {});
  parent.postMessage({ type: KNAVI_FRAME_ID_MSG, frameId }, "*");
}

// Listen for children's frameId announcements and maintain a local iframe map.
// If `notify` is true, also register each child with the background.
export function listenForChildFrames(
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
        console.warn,
      );
    }
  });
}

function findIframeBySource(
  source: MessageEventSource | null,
): HTMLIFrameElement | null {
  if (!source) return null;
  for (const iframe of document.querySelectorAll("iframe")) {
    if (iframe.contentWindow === source) return iframe;
  }
  return null;
}
