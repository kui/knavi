import { sendToRuntime } from "../lib/chrome-messages";

export class RectAggregatorClient {
  constructor() {
    if (window !== window.parent) {
      throw Error("RectAggregatorClient should be created in top frame");
    }
  }

  // Ask the background to fan out to every frame and return the composed,
  // root-viewport rects in a single response.
  aggregate(): Promise<ElementRects[]> {
    return sendToRuntime("InitAllRects");
  }

  action(elementId: ElementId | undefined, options: ActionOptions) {
    if (elementId)
      return sendToRuntime("ExecuteAction", { id: elementId, options });
  }
}
