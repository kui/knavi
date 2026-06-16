import { sendToRuntime } from "../lib/chrome-messages";
import { getContentRects } from "../dom/elements";
import { Rect } from "../dom/rects";
import { printError } from "../lib/errors";

export class BlurerContentAll {
  constructor(
    private readonly iframeByFrameId: Map<number, HTMLIFrameElement>,
  ) {}

  // Handles BlurRelay from background: transform rect to parent coords and send BlurUp.
  handleBlurRelay(
    childFrameId: number,
    rectJson: RectJSON<"element-border", "layout-viewport"> | null,
  ) {
    const frame = this.iframeByFrameId.get(childFrameId);
    if (!frame) {
      console.warn("Unknown childFrameId for BlurRelay:", childFrameId);
      return;
    }
    const rect = buildBlurRect(frame, rectJson);
    sendToRuntime("BlurUp", { rect }).catch(printError);
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
