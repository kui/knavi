import { sendToRuntime } from "../lib/chrome-messages";
import { getBoundingClientRect } from "../dom/elements";

export default class BlurerClient {
  blur() {
    if (isDefaultActiveElement()) return false;
    if (!document.activeElement) return false;
    sendToRuntime("BlurUp", {
      rect: getBoundingClientRect(document.activeElement),
    }).catch(console.warn);
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
