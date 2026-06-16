import { sendToRuntime } from "../lib/chrome-messages";
import { getBoundingClientRect } from "../dom/elements";
import { printWarn } from "../lib/errors";

// Send a BlurUp message to the background to relay blur up through the frame hierarchy.
export default class BlurerClient {
  blur() {
    if (isDefaultActiveElement()) return false;
    if (!document.activeElement) return false;
    sendToRuntime("BlurUp", {
      rect: getBoundingClientRect(document.activeElement),
    }).catch(printWarn);
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
