import BlurView from "./blurer-view";
import { Rect } from "./rects";

if (parent !== window)
  throw Error("This script must be loaded in the root frame.");

export class BlurerContentRoot {
  constructor(private view: BlurView) {}

  handleBlurMessage(
    source: MessageEventSource | null,
    rect: RectJSON<"element-border", "layout-viewport"> | null,
  ) {
    if (source !== window) {
      // Do nothing if the message was sent from the child frame.
      // See also: src/lib/blurer-content-all.ts
      return;
    }

    if (!rect) {
      console.warn("Unexpected rect: ", rect);
      return;
    }

    const activeElement = document.activeElement;
    if (!activeElement || !("blur" in activeElement)) return;
    (activeElement.blur as () => void)();

    // We can treat layout viewport as root viewport in the root frame.
    this.view.blur(new Rect({ ...rect, origin: "root-viewport" }));
  }
}
