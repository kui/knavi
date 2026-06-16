import { sendToRuntime } from "../lib/chrome-messages";
import * as vp from "./viewports";

export class RectAggregatorClient {
  constructor() {
    if (window !== window.parent) {
      throw Error("RectAggregatorClient should be created in top frame");
    }
  }

  // Aggregate all rects including elements inside iframes via recursive relay.
  aggregate(): Promise<ElementRects[]> {
    const viewport: RectJSON<"actual-viewport", "root-viewport"> = {
      type: "actual-viewport",
      origin: "root-viewport",
      x: 0,
      y: 0,
      ...vp.layout.sizes(),
    };
    const frameOffsets: CoordinatesJSON<"layout-viewport", "root-viewport"> = {
      type: "layout-viewport",
      origin: "root-viewport",
      x: 0,
      y: 0,
    };
    return sendToRuntime("InitRects", { viewport, frameOffsets });
  }

  action(elementId: ElementId, options: ActionOptions) {
    return sendToRuntime("ExecuteAction", { id: elementId, options });
  }
}
