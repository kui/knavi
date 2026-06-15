import BlurView from "./blurer-view";
import { transformBlurRect } from "../dom/blur-rect";
import { Rect } from "../lib/rects";

if (parent !== window)
  throw Error("This script must be loaded in the root frame.");

export class BlurerContentRoot {
  constructor(
    private view: BlurView,
    private iframeMap: Map<number, HTMLIFrameElement>,
  ) {}

  handleBlurRelay(
    childFrameId: number,
    rectJson: RectJSON<"element-border", "layout-viewport">,
  ) {
    const rect =
      childFrameId === 0
        ? new Rect({ ...rectJson, origin: "root-viewport" })
        : toRootViewport(this.iframeMap, childFrameId, rectJson);
    if (!rect) return;

    const activeElement = document.activeElement;
    if (!activeElement || !("blur" in activeElement)) return;
    (activeElement.blur as () => void)();

    this.view.blur(rect);
  }
}

function toRootViewport(
  iframeMap: Map<number, HTMLIFrameElement>,
  childFrameId: number,
  originRectJson: RectJSON<"element-border", "layout-viewport">,
): Rect<"element-border", "root-viewport"> | null {
  const layoutRect = transformBlurRect(iframeMap, childFrameId, originRectJson);
  return layoutRect && new Rect({ ...layoutRect, origin: "root-viewport" });
}
