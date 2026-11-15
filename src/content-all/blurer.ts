import { sendToRuntime } from "../lib/chrome-messages";
import { getContentRects } from "../dom/elements";
import { Rect } from "../dom/rects";
import { printError } from "../lib/errors";
import { FramePath } from "./frame-path";

export class BlurerContentAll {
  constructor(private readonly framePath: FramePath) {}

  /**
   * Handles BlurRelay from background, which is delivered to every frame:
   * ignores it unless this frame is the parent at `targetPath`, then
   * transforms the rect to this frame's coords and sends BlurUp.
   */
  handleBlurRelay(
    targetPath: string[],
    childSegment: string,
    rectJson: RectJSON<"element-border", "layout-viewport"> | null,
  ) {
    if (!this.framePath.matches(targetPath)) return;
    const frame = this.framePath.findChild(childSegment);
    if (!frame) {
      console.warn("Unknown child for BlurRelay:", childSegment);
      return;
    }
    if (!frame.isConnected) {
      console.debug("BlurRelay: iframe no longer connected, skipping", frame);
      return;
    }
    const rect = buildBlurRect(frame, rectJson);
    sendToRuntime("BlurUp", { path: targetPath, rect }).catch(printError);
  }
}

function buildBlurRect(
  sourceIframe: HTMLIFrameElement,
  originRectJson: RectJSON<"element-border", "layout-viewport"> | null,
): Rect<"element-border", "layout-viewport"> | null {
  if (!originRectJson) return null;

  const sourceViewport = getContentRects(sourceIframe)[0];
  if (!sourceViewport) return null;

  const originRect = new Rect({ ...originRectJson, origin: "element-content" });
  return originRect.offsets(sourceViewport.reverse());
}
