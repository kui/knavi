import BlurView from "./blurer-view";
import { transformBlurRect } from "../dom/blur-rect";

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
    // In root frame, layout-viewport === root-viewport.
    const rect = transformBlurRect(
      this.iframeMap,
      childFrameId,
      rectJson,
      "root-viewport",
    );
    if (!rect) return;

    const activeElement = document.activeElement;
    if (!activeElement || !("blur" in activeElement)) return;
    (activeElement.blur as () => void)();

    this.view.blur(rect);
  }
}
