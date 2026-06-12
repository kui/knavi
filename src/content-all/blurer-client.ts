import { postMessageTo } from "../dom/dom-messages";
import { getBoundingClientRect } from "../dom/elements";

// Just send a message to the parent frame to blur the active element on root frame.
// This doesn't call `blur` method of the active element directly.
export default class Blur {
  constructor(private readonly getParentNonce: () => string | null) {}

  blur() {
    if (isDefaultActiveElement()) return false;
    if (!document.activeElement) return false;
    postMessageTo(parent, "com.github.kui.knavi.Blur", {
      nonce: this.getParentNonce(),
      rect: getBoundingClientRect(document.activeElement),
    });
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
