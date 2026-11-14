import { sendToRuntime } from "../lib/chrome-messages";
import { getBoundingClientRect } from "../dom/elements";
import { printError } from "../lib/errors";
import { FramePath } from "./frame-path";

/** Sends BlurUp to background, which relays it toward the root frame. */
export default class Blur {
  constructor(private readonly framePath: FramePath) {}

  blur() {
    if (isDefaultActiveElement()) return false;
    if (!document.activeElement) return false;
    const rect = getBoundingClientRect(document.activeElement);
    const path = this.framePath.current();
    if (!path) {
      console.warn("Cannot blur: this frame's path is unknown");
      return false;
    }
    sendToRuntime("BlurUp", { path, rect }).catch(printError);
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
