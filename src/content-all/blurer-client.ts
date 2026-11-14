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
    const path = this.framePath.current();
    if (!path) {
      /* WHY: a frame that does not know its path yet cannot relay the blur to
         its parent, but the key is still ours. */
      console.warn("Cannot relay blur: this frame's path is unknown");
      (document.activeElement as Partial<HTMLElement>).blur?.();
      return true;
    }
    const rect = getBoundingClientRect(document.activeElement);
    sendToRuntime("BlurUp", { path, rect }).catch(printError);
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
