import {
  Z_INDEX_OFFSET,
  applyRect,
  applyStyle,
  getPaddingRects,
} from "./elements";
import { Coordinates, Rect } from "./rects";

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

    // The coordinates of the <body> element may need to be used as the offset of the "container"
    // depending on the CSS position of the <body> element.
    // See https://developer.mozilla.org/en-US/docs/Web/CSS/position#absolute_positioning
    // > The absolutely positioned element is positioned relative to its nearest positioned
    // > ancestor (i.e., the nearest ancestor that is not static).
    const bodyOffsets: Coordinates<"element-padding", "root-viewport"> =
      getComputedStyle(body).position === "static"
        ? new Coordinates({
            type: "element-padding",
            origin: "root-viewport",
            x: 0,
            y: 0,
          })
        : new Coordinates({
            ...getPaddingRects(body)[0],
            origin: "root-viewport",
          });

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
