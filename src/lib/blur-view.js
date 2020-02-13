import * as vp from "./viewports";
import * as rectUtils from "./rects";
import { subscribe } from "./chrome-messages";

const Z_INDEX_OFFSET = 2147483640;

export default class BlurView {
  constructor() {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute",
      display: "block",
      border: "none",
      outline: "none",
      zIndex: Z_INDEX_OFFSET.toString()
    });

    function removeOverlay() {
      const body = document.body;
      if (!body) return;
      if (body.contains(overlay)) {
        body.removeChild(overlay);
      }
    }

    subscribe("Blured", ({ rect }) => {
      const body = document.body;
      if (!body) return;

      removeOverlay();

      if (!rect) return;

      const bodyPosition = window.getComputedStyle(document.body).position;
      let bodyOffsets;
      if (bodyPosition === "static") {
        bodyOffsets = { x: 0, y: 0 };
      } else {
        const bodyRect = vp.getBoundingClientRectFromRoot(body);
        bodyOffsets = { y: bodyRect.top, x: bodyRect.left };
      }

      rect = rectUtils.move(rect, vp.visual.offsets());
      Object.assign(overlay.style, {
        top: `${rect.top - bodyOffsets.y}px`,
        left: `${rect.left - bodyOffsets.x}px`,
        height: `${rect.height}px`,
        width: `${rect.width}px`
      });
      body.insertBefore(overlay, body.firstChild);

      // $FlowFixMe
      const animation = overlay.animate([{ boxShadow: "0 0   0    0 rgba(128,128,128,0.15), 0 0   0    0 rgba(0,0,128,0.1)" }, { boxShadow: "0 0 3px 72px rgba(128,128,128,   0), 0 0 3px 80px rgba(0,0,128,  0)" }], {
        duration: 400
      });
      animation.addEventListener("finish", removeOverlay);
    });
  }
}