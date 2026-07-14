import BlurView from "./blurer-view";
import { Rect } from "../dom/rects";

if (parent !== window)
  throw Error("This script must be loaded in the root frame.");

export class BlurerContentRoot {
  constructor(private view: BlurView) {}

  handleBlurRoot(rect: RectJSON<"element-border", "layout-viewport"> | null) {
    const activeElement = document.activeElement;
    if (!activeElement || !("blur" in activeElement)) return;
    (activeElement.blur as () => void)();

    if (!rect) return;
    // INVARIANT: In the root frame, layout-viewport coordinates equal root-viewport coordinates.
    this.view.blur(new Rect({ ...rect, origin: "root-viewport" }));
  }
}
