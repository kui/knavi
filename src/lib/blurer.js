// @flow

import { filter, first } from "./iters";
import * as vp from "./viewports";
import { send } from "./chrome-messages";
import { intersection, move } from "./rects";

import type { Rect } from "./rects";

/// a message from a child frame indicates to blur.
const BLUR_MESSAGE = "jp-k-ui-knavi-Blur";

export type Blured = {
  type: "Blured";
  rect: ?Rect;
};

export default class Blurer {
  constructor() {
    // Blur request from a child frame
    window.addEventListener("message", (e) => {
      if (e.data.type !== BLUR_MESSAGE) return;
      console.debug("blur", e.data, "location=", location.href);
      if (e.source === window) {
        document.activeElement.blur();
        send(({ type: "Blured", rect: e.data.rect }: Blured));
        return;
      }

      const sourceIframe = first(filter(document.querySelectorAll("iframe"),
                                        (i) => e.source === (i: any).contentWindow));
      if (!sourceIframe) return;
      const sourceRect = vp.getClientRectsFromVisualVP(sourceIframe)[0];
      const offsettedRect = move(e.data.rect, { x: sourceRect.left, y: sourceRect.top });

      const rect = intersection(sourceRect, offsettedRect);
      window.parent.postMessage({ type: BLUR_MESSAGE, rect }, "*");
    });
  }

  blur(): boolean {
    if (isInRootFrame() && !isBlurable()) return false;
    const rect = vp.getClientRectsFromVisualVP(document.activeElement)[0];
    window.parent.postMessage({ type: BLUR_MESSAGE, rect }, "*");
    return true;
  }
}

function isBlurable() {
  return document.activeElement !== document.body;
}

function isInRootFrame() {
  return window.parent === window;
}

