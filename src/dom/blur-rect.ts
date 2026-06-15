import { getContentRects } from "./elements";
import { Rect } from "./rects";

export function transformBlurRect(
  iframeMap: Map<number, HTMLIFrameElement>,
  childFrameId: number,
  originRectJson: RectJSON<"element-border", "layout-viewport">,
): Rect<"element-border", "layout-viewport"> | null;
export function transformBlurRect(
  iframeMap: Map<number, HTMLIFrameElement>,
  childFrameId: number,
  originRectJson: RectJSON<"element-border", "layout-viewport">,
  targetOrigin: "root-viewport",
): Rect<"element-border", "root-viewport"> | null;
export function transformBlurRect(
  iframeMap: Map<number, HTMLIFrameElement>,
  childFrameId: number,
  originRectJson: RectJSON<"element-border", "layout-viewport">,
  targetOrigin?: "root-viewport",
): Rect<"element-border", "layout-viewport" | "root-viewport"> | null {
  // childFrameId === 0 means the caller is the root frame itself (no iframe transform).
  if (childFrameId === 0) {
    return new Rect({
      ...originRectJson,
      origin: targetOrigin ?? "layout-viewport",
    });
  }

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
  const layoutRect = originRect.offsets(sourceViewport.reverse());
  return new Rect({ ...layoutRect, origin: targetOrigin ?? "layout-viewport" });
}
