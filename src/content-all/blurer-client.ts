import { sendToRuntime } from "../lib/chrome-messages";
import { getBoundingClientRect } from "../dom/elements";
import { printError } from "../lib/errors";

// Sends BlurUp to background, which relays it toward the root frame.
export default class Blur {
  blur() {
    if (isDefaultActiveElement()) return false;
    if (!document.activeElement) return false;
    sendToRuntime("BlurUp", {
      rect: getBoundingClientRect(document.activeElement),
    }).catch(printError);
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
