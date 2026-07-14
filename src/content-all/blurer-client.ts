import { sendToRuntime } from "../lib/chrome-messages";
import { getBoundingClientRect } from "../dom/elements";
import { printError } from "../lib/errors";
import { FrameRegistry } from "./frame-registration";

/** Sends BlurUp to background, which relays it toward the root frame. */
export default class Blur {
  constructor(private readonly frameRegistry: FrameRegistry) {}

  blur() {
    if (isDefaultActiveElement()) return false;
    if (!document.activeElement) return false;
    const rect = getBoundingClientRect(document.activeElement);
    this.frameRegistry.parentFrameId
      .then((parentFrameId) => {
        if (parentFrameId == null) {
          // WHY: root frame: send directly to BlurRoot via parentFrameId 0.
          return sendToRuntime("BlurUp", { parentFrameId: 0, rect });
        }
        return sendToRuntime("BlurUp", { parentFrameId, rect });
      })
      .catch(printError);
    return true;
  }
}

function isDefaultActiveElement() {
  return parent === window && document.activeElement === document.body;
}
