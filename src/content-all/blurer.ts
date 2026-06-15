import { sendToRuntime } from "../lib/chrome-messages";
import { transformBlurRect } from "../dom/blur-rect";

export class BlurerContentAll {
  constructor(private iframeMap: Map<number, HTMLIFrameElement>) {}

  handleBlurRelay(
    childFrameId: number,
    rectJson: RectJSON<"element-border", "layout-viewport">,
  ) {
    // Registered only in sub-frames (see content-all.ts), so the relay always
    // needs to be transformed and forwarded one level up.
    const rect = transformBlurRect(this.iframeMap, childFrameId, rectJson);
    if (!rect) return;
    sendToRuntime("BlurUp", { rect }).catch(console.warn);
  }
}
