import { getContentRects } from "./elements";
import { Rect } from "./rects";

export function transformBlurRect(
  iframeMap: Map<number, HTMLIFrameElement>,
  childFrameId: number,
  originRectJson: RectJSON<"element-border", "layout-viewport">,
): Rect<"element-border", "layout-viewport"> | null {
  const sourceIframe = iframeMap.get(childFrameId);
  if (!sourceIframe?.isConnected) {
    console.warn("Blur target iframe not found for childFrameId", childFrameId);
    iframeMap.delete(childFrameId);
    return null;
  }
  const sourceViewport = getContentRects(sourceIframe)[0];
  if (!sourceViewport) {
    console.warn("No viewport:", sourceIframe);
    return null;
  }

  // A child frame's layout-viewport origin coincides with its iframe's
  // content-box top-left, so we can reinterpret the incoming rect as relative
  // to element-content for the purposes of coordinate transformation.
  const originRect = new Rect({ ...originRectJson, origin: "element-content" });
  return originRect.offsets(sourceViewport.reverse());
}
