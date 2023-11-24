import { filter, first } from "./iters";
import * as vp from "./viewports";
import { sendToRuntime } from "./chrome-messages";
import * as rectUtils from "./rects";
import { printError } from "./errors";
import { postMessageTo } from "./dom-messages";

import type { MessagePayload } from "./dom-messages";

export default class Blurer {
  handleBlurMessage(
    event: MessageEvent<MessagePayload<"com.github.kui.knavi.Blur">>,
  ) {
    console.debug("blur", event.data, "location=", location.href);

    if (event.source === window) {
      // Blur then stop bubbling.
      const activeElement = document.activeElement;
      if (!activeElement || !("blur" in activeElement)) return;
      (activeElement.blur as () => void)();
      sendToRuntime("AfterBlur", { rect: event.data.rect }).catch(printError);
      return;
    }

    // Bubble up the message to the parent frame.

    postMessageTo(parent, "com.github.kui.knavi.Blur", {
      rect: buildBlurRect(event.source, event.data.rect),
    });
  }

  blur() {
    if (!isBlurable()) return false;
    if (!document.activeElement) return false;
    const rect = getFirstClientRectFromVisualVp(document.activeElement);
    postMessageTo(parent, "com.github.kui.knavi.Blur", { rect });
    return true;
  }
}

function buildBlurRect(
  source: MessageEventSource | null,
  originRect: Rect | null,
): Rect | null {
  if (originRect === null || !(source instanceof Window)) return null;

  const sourceIframe = first(
    filter(
      document.querySelectorAll("iframe"),
      (i) => source === i.contentWindow,
    ),
  );
  if (!sourceIframe) {
    console.error("Blur target is not an iframe", event);
    return null;
  }

  const sourceVvp = getFirstClientRectFromVisualVp(sourceIframe);
  const offsettedTargetRect = rectUtils.move(originRect, sourceVvp);
  return rectUtils.intersection(sourceVvp, offsettedTargetRect);
}

function isBlurable() {
  return !(parent === window && document.activeElement === document.body);
}

function getFirstClientRectFromVisualVp(element: Element) {
  if (element.tagName === "BODY") {
    return vp.visual.rect();
  } else {
    return getRectFromVisualVp(element.getClientRects()[0]);
  }
}

function getRectFromVisualVp(rectFromLayoutVp: Rect): Rect {
  const rectFromRoot = rectUtils.move(rectFromLayoutVp, vp.layout.offsets());
  return rectUtils.offsets(rectFromRoot, vp.visual.offsets());
}
