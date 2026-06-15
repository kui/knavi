import BlurView from "./blurer-view";
import { transformBlurRect } from "../dom/blur-rect";
import { Rect } from "../dom/rects";

if (parent !== window)
  throw Error("This script must be loaded in the root frame.");

export class BlurerContentRoot {
  constructor(
    private view: BlurView,
    private iframeMap: Map<number, HTMLIFrameElement>,
  ) {}

  handleBlurRelay(
    childFrameId: number,
    rectJson: RectJSON<"element-border", "layout-viewport"> | null,
  ) {
    if (!rectJson) {
      console.warn("Unexpected rect:", rectJson);
      return;
    }

    const rect = this.toRootViewport(childFrameId, rectJson);
    if (!rect) return;

    const activeElement = document.activeElement;
    if (!activeElement || !("blur" in activeElement)) return;
    (activeElement.blur as () => void)();

    this.view.blur(rect);
  }

  // In root frame, layout-viewport === root-viewport.
  private toRootViewport(
    childFrameId: number,
    rectJson: RectJSON<"element-border", "layout-viewport">,
  ): Rect<"element-border", "root-viewport"> | null {
    return transformBlurRect(
      this.iframeMap,
      childFrameId,
      rectJson,
      "root-viewport",
    );
  }
}
