import { sendToRuntime } from "../lib/chrome-messages";
import { createQueue } from "../lib/generators";

export class RectAggregatorClient {
  private requestIndex = 0;
  private callback:
    | ((elementRects: ElementRects[] | "Complete") => void)
    | null = null;

  constructor() {
    if (window !== window.parent) {
      throw Error("RectAggregatorClient should be created in top frame");
    }
  }

  async *aggregate(): AsyncGenerator<ElementRects[]> {
    if (this.callback) throw Error("Illegal state: already fetching");

    const requestId = ++this.requestIndex;
    const { enqueue, dequeue } = createQueue<ElementRects[] | "Complete">();

    // Set callback before sending InitAllRects: background sends ResponseRectsFragment
    // before returning, so the callback must be ready when it arrives.
    this.callback = (rects) => enqueue.next(rects);
    sendToRuntime("InitAllRects", { requestId }).catch(console.warn);

    for await (const rects of dequeue) {
      if (rects === "Complete") {
        return;
      } else if (rects) {
        yield rects;
      }
    }
  }

  handleRects(requestId: number, rects: ElementRects[]) {
    if (requestId !== this.requestIndex) {
      console.warn("Unexpected requestId: ", requestId);
      return;
    }
    if (!this.callback) {
      console.warn("Not aggregating phase: ", rects);
      return;
    }
    this.callback(rects);
  }

  action(elementId: ElementId | undefined, options: ActionOptions) {
    if (!this.callback) throw Error("Illegal state: not aggregating");
    const callback = this.callback;
    this.callback = null;
    callback("Complete");
    if (elementId)
      return sendToRuntime("ExecuteAction", { id: elementId, options });
  }
}
