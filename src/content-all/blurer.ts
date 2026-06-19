import { sendToRuntime } from "../lib/chrome-messages";
import { getContentRects } from "../dom/elements";
import { Rect } from "../dom/rects";
import { printError } from "../lib/errors";
import { FrameRegistry } from "./frame-registration";

export class BlurerContentAll {
  constructor(private readonly frameRegistry: FrameRegistry) {}

  // Handles BlurRelay from background: transform rect to parent coords and send BlurUp.
  handleBlurRelay(
    childFrameId: number,
    rectJson: RectJSON<"element-border", "layout-viewport"> | null,
  ) {
    const frame = this.frameRegistry.getIframe(childFrameId);
    if (!frame) {
      console.warn("Unknown childFrameId for BlurRelay:", childFrameId);
      return;
    }
    if (!frame.isConnected) {
      // The iframe was removed from DOM; its entry will be ignored next lookup.
      console.debug("BlurRelay: iframe no longer connected, skipping", frame);
      return;
    }
    const rect = buildBlurRect(frame, rectJson);
    this.frameRegistry.parentFrameId
      .then((parentFrameId) =>
        sendToRuntime("BlurUp", { parentFrameId: parentFrameId ?? 0, rect }),
      )
      .catch(printError);
  }
}

function buildBlurRect(
  sourceIframe: HTMLIFrameElement,
  originRectJson: RectJSON<"element-border", "layout-viewport"> | null,
): Rect<"element-border", "layout-viewport"> | null {
  if (!originRectJson) {
    console.warn("Unexpected origin rect:", originRectJson);
    return null;
  }

  const sourceViewport = getContentRects(sourceIframe)[0];
  if (!sourceViewport) {
    console.warn("No viewport:", sourceIframe);
    return null;
  }

  const originRect = new Rect({ ...originRectJson, origin: "element-content" });
  return originRect.offsets(sourceViewport.reverse());
}
