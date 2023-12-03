import {
  Z_INDEX_OFFSET,
  applyRect,
  applyStyle,
  getPaddingRects,
  rectAsRootViewport,
} from "./elements";
import { Rect } from "./rects";

const ANIMATION_DURATION_MS = 400;

export default class BlurView {
  private overlay: HTMLDivElement;

  constructor() {
    this.overlay = document.createElement("div");
    applyStyle(this.overlay, {
      position: "absolute",
      display: "block",
      border: "none",
      outline: "none",
      padding: "0",
      margin: "0",
      zIndex: Z_INDEX_OFFSET.toString(),
    });
  }

  private remove() {
    const body = document.body;
    if (!body) return;
    body.removeChild(this.overlay);
  }

  blur(rect: Rect<"element-border", "root-viewport">) {
    const body = document.body;
    if (!body) return;

    this.remove();

    const bodyOffsets = rectAsRootViewport(getPaddingRects(body)[0]);
    applyRect(this.overlay, rect.offsets(bodyOffsets));
    body.insertBefore(this.overlay, body.firstChild);

    const animation = this.overlay.animate(
      [
        {
          boxShadow:
            "0 0   0    0 rgba(128,128,128,0.15), 0 0   0    0 rgba(0,0,128,0.1)",
        },
        {
          boxShadow:
            "0 0 3px 72px rgba(128,128,128,   0), 0 0 3px 80px rgba(0,0,128,  0)",
        },
      ],
      {
        duration: ANIMATION_DURATION_MS,
      },
    );
    animation.addEventListener("finish", () => this.remove());
  }
}
