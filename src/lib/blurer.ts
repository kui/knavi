import { filter, first } from "./iters.js";
import * as vp from "./viewports.js";
import { send } from "./chrome-messages.js";
import * as rectUtils from "./rects.js";

/// a message from a child frame indicates to blur.
const BLUR_TYPE = "jp-k-ui-knavi-Blur";

export default class Blurer {
  constructor() {
    // Blur request from a child frame
    window.addEventListener("message", (e) => {
      if (e.data.type !== BLUR_TYPE) return;
      console.debug("blur", e.data, "location=", location.href);
      if (e.source === window) {
        if (!document.activeElement) return;
        document.activeElement.blur();
        send({ type: "Blured", rect: e.data.rect });
        return;
      }

      const sourceIframe = first(
        filter(
          document.querySelectorAll("iframe"),
          (i) => e.source === i.contentWindow,
        ),
      );
      if (!sourceIframe) return;
      const sourceRect = getFirstClientRectFromVisualVp(sourceIframe);
      const offsettedRect = rectUtils.move(e.data.rect, {
        x: sourceRect.left,
        y: sourceRect.top,
      });

      const rect = rectUtils.intersection(sourceRect, offsettedRect);
      window.parent.postMessage({ type: BLUR_TYPE, rect }, "*");
    });
  }

  blur() {
    if (!isBlurable()) return false;
    if (!document.activeElement) return false;
    const rect = getFirstClientRectFromVisualVp(document.activeElement);
    window.parent.postMessage({ type: BLUR_TYPE, rect }, "*");
    return true;
  }
}

function isBlurable() {
  return !(
    window.parent === window && document.activeElement === document.body
  );
}

function getFirstClientRectFromVisualVp(element) {
  if (element.tagName === "BODY") {
    return vp.visual.rect();
  } else {
    return getRectFromVisualVp(element.getClientRects()[0]);
  }
}

function getRectFromVisualVp(rectFromLayoutVp) {
  const layoutVpOffsets = vp.layout.offsets();
  const visualVpOffsets = vp.visual.offsets();
  return rectUtils.offsets(
    rectUtils.move(rectFromLayoutVp, layoutVpOffsets),
    visualVpOffsets,
  );
}
