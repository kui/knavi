// @flow

import { filter, first } from "./iters";
import * as vp from "./viewports";
import { send } from "./chrome-messages";
import * as rectUtils from "./rects";

import type { Rect } from "./rects";

/// a message from a child frame indicates to blur.
const BLUR_TYPE = "jp-k-ui-knavi-Blur";

export type Blured = {
  type: "Blured";
  rect: ?Rect;
};

export default class Blurer {
  constructor() {
    // Blur request from a child frame
    window.addEventListener("message", (e) => {
      if (e.data.type !== BLUR_TYPE) return;
      console.debug("blur", e.data, "location=", location.href);
      if (e.source === window) {
        document.activeElement.blur();
        send(({ type: "Blured", rect: e.data.rect }: Blured));
        return;
      }

      const sourceIframe = first(filter(document.querySelectorAll("iframe"),
                                        (i) => e.source === (i: any).contentWindow));
      if (!sourceIframe) return;
      const sourceRect = getFirstClientRectFromVisualVp(sourceIframe);
      const offsettedRect = rectUtils.move(e.data.rect, { x: sourceRect.left, y: sourceRect.top });

      const rect = rectUtils.intersection(sourceRect, offsettedRect);
      window.parent.postMessage({ type: BLUR_TYPE, rect }, "*");
    });
  }

  blur(): boolean {
    if (isInRootFrame() && !isBlurable()) return false;
    const rect = getFirstClientRectFromVisualVp(document.activeElement);
    window.parent.postMessage({ type: BLUR_TYPE, rect }, "*");
    return true;
  }
}

function isBlurable() {
  return document.activeElement !== document.body;
}

function isInRootFrame() {
  return window.parent === window;
}

function getFirstClientRectFromVisualVp(element): Rect {
  if (element.tagName === "BODY") {
    return vp.visual.rect();
  } else {
    return getRectFromVisualVp(element.getClientRects()[0]);
  }
}

function getRectFromVisualVp(rectFromLayoutVp): Rect {
  const layoutVpOffsets = vp.layout.offsets();
  const visualVpOffsets = vp.visual.offsets();
  return rectUtils.offsets(rectUtils.move(rectFromLayoutVp,
                                          layoutVpOffsets),
                           visualVpOffsets);
}
