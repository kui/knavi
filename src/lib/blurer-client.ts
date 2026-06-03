import { postMessageTo } from "./dom-messages.ts";
import { getBoundingClientRect } from "./elements.ts";

// Just send a message to the parent frame to blur the active element on root frame.
// This doesn't call `blur` method of the active element directly.
export default class Blur {
  blur() {
    if (isDefaultActiveElement()) return false;
    if (!document.activeElement) return false;
    postMessageTo(parent, "com.github.kui.knavi.Blur", {
      rect: getBoundingClientRect(document.activeElement),
    });
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
