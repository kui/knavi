import { filter, first } from "./iters";
import * as vp from "./viewports";
import { sendToRuntime } from "./chrome-messages";
import * as rectUtils from "./rects";

// a message from a child frame indicates to blur.
const BLUR_TYPE = "com.github.kui.knavi.Blur";

interface Blur {
  type: typeof BLUR_TYPE;
  rect: Rect;
}

export default class Blurer {
  handleMessageEvent(event: MessageEvent<{ type?: string }>) {
    if (!isBlurMessage(event)) return;
    console.debug("blur", event.data, "location=", location.href);

    if (event.source === window) {
      // Blur then stop bubbling.
      this.blur();
      sendToRuntime("AfterBlur", { rect: event.data.rect }).catch(
        console.error,
      );
      return;
    }

    // Bubble up the message to the parent frame.

    const sourceIframe = first(
      filter(
        document.querySelectorAll("iframe"),
        (i) => event.source === i.contentWindow,
      ),
    );
    if (!sourceIframe) return;
    const sourceRect = getFirstClientRectFromVisualVp(sourceIframe);
    const offsettedTargetRect = rectUtils.move(event.data.rect, {
      x: sourceRect.x,
      y: sourceRect.y,
    });
    const rect = rectUtils.intersection(sourceRect, offsettedTargetRect);
    if (!rect) {
      console.debug(
        "Blur target might not be visible: sourceRect=",
        sourceRect,
        "offsettedTargetRect=",
        offsettedTargetRect,
      );
      return;
    }
    parent.postMessage({ type: BLUR_TYPE, rect }, "*");
  }

  blur() {
    if (!isBlurable()) return false;
    if (!document.activeElement) return false;
    const rect = getFirstClientRectFromVisualVp(document.activeElement);
    parent.postMessage({ type: BLUR_TYPE, rect }, "*");
    return true;
  }
}

function isBlurable() {
  return !(parent === window && document.activeElement === document.body);
}

function isBlurMessage(
  event: MessageEvent<{ type?: string }>,
): event is MessageEvent<Blur> {
  return event.data.type === BLUR_TYPE;
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
