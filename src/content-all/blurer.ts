import { sendToRuntime } from "../lib/chrome-messages";
import { transformBlurRect } from "../dom/blur-rect";

export class BlurerContentAll {
  constructor(private iframeMap: Map<number, HTMLIFrameElement>) {}

  handleBlurRelay(
    childFrameId: number,
    rectJson: RectJSON<"element-border", "layout-viewport">,
  ) {
    const rect = transformBlurRect(this.iframeMap, childFrameId, rectJson);
    if (!rect) return;
    sendToRuntime("BlurUp", { rect }).catch(console.warn);
  }
}
