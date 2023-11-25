import { applyStyle } from "./elements";
import * as vp from "./viewports";
import * as rectUtils from "./rects";
import { Router } from "./chrome-messages";

const ANIMATION_DURATION_MS = 400;
const Z_INDEX_OFFSET = 2147483640;

export default class BlurView {
  private overlay: HTMLDivElement;

  constructor() {
    this.overlay = document.createElement("div");
    applyStyle(this.overlay, {
      position: "absolute",
      display: "block",
      border: "none",
      outline: "none",
      zIndex: Z_INDEX_OFFSET.toString(),
    });
  }

  private remove() {
    const body = document.body;
    if (!body) return;
    body.removeChild(this.overlay);
  }

  blur(
    // Offsetted by visual viewport.
    rect: Rect | null,
  ) {
    if (!rect) return;

    const body = document.body;
    if (!body) return;

    this.remove();

    const bodyPosition = window.getComputedStyle(document.body).position;
    let bodyOffsets: Coordinates;
    if (bodyPosition === "static") {
      bodyOffsets = { x: 0, y: 0 };
    } else {
      const bodyRect = vp.getBoundingClientRectFromRoot(body);
      bodyOffsets = { y: bodyRect.y, x: bodyRect.x };
    }

    rect = rectUtils.move(rect, vp.visual.offsets());
    applyStyle(this.overlay, {
      top: `${rect.y - bodyOffsets.y}px`,
      left: `${rect.x - bodyOffsets.x}px`,
      height: `${rect.height}px`,
      width: `${rect.width}px`,
    });
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

  router() {
    return Router.newInstance().add("AfterBlur", (message) =>
      this.blur(message.rect),
    );
  }
}
