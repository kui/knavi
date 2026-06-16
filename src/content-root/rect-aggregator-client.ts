import { sendToRuntime } from "../lib/chrome-messages";

export class RectAggregatorClient {
  constructor() {
    if (window !== window.parent) {
      throw Error("RectAggregatorClient should be created in top frame");
    }
  }

  // Kick off recursive top-down rect aggregation. The root frame's viewport
  // and a (0,0) root-viewport origin are passed through so every frame
  // handles FetchRects with the same payload shape.
  aggregate(): Promise<ElementRects[]> {
    return sendToRuntime("InitRects", {
      viewport: {
        type: "actual-viewport",
        origin: "layout-viewport",
        x: 0,
        y: 0,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      rootOrigin: {
        type: "root-viewport",
        origin: "layout-viewport",
        x: 0,
        y: 0,
      },
    });
  }

  action(elementId: ElementId, options: ActionOptions) {
    return sendToRuntime("ExecuteAction", { id: elementId, options });
  }
}
