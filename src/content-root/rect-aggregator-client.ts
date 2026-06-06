import { sendToRuntime } from "../lib/chrome-messages.ts";
import { postMessageTo } from "../dom/dom-messages.ts";
import { createQueue } from "../lib/generators.ts";
import * as vp from "./viewports.ts";

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

  // Aggregate all rects include elements inside iframe.
  // Requests are thrown by `postMessage` (frame message passing),
  async *aggregate(): AsyncGenerator<ElementRects[]> {
    if (this.callback) throw Error("Illegal state: already fetching");

    postMessageTo(window, "com.github.kui.knavi.AllRectsRequest", {
      id: ++this.requestIndex,
      viewport: {
        type: "actual-viewport",
        origin: "root-viewport",
        x: 0,
        y: 0,
        ...vp.layout.sizes(),
      },
      offsets: { type: "layout-viewport", origin: "root-viewport", x: 0, y: 0 },
    });

    const { enqueue, dequeue } = createQueue<ElementRects[] | "Complete">();

    this.callback = (rects) => enqueue.next(rects);
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

  action(
    // Provide null to execute no action.
    elementId: ElementId | undefined,
    options: ActionOptions,
  ) {
    if (!this.callback) throw Error("Illegal state: not aggregating");
    // Clear the callback synchronously before signalling "Complete" (which ends
    // the aggregate() loop on a later micro-task) so a second aggregate() call
    // from a concurrent AttachHints does not throw "already fetching".
    const callback = this.callback;
    this.callback = null;
    callback("Complete");
    if (elementId)
      return sendToRuntime("ExecuteAction", { id: elementId, options });
  }
}
