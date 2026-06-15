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
    const activeElement = document.activeElement;
    if (!activeElement || !("blur" in activeElement)) return;
    (activeElement.blur as () => void)();

    const rect =
      childFrameId === 0
        ? rectJson
        : transformBlurRect(this.iframeMap, childFrameId, rectJson);
    if (rect) this.view.blur(new Rect({ ...rect, origin: "root-viewport" }));
  }
}
