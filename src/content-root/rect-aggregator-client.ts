import { sendToRuntime } from "../lib/chrome-messages";
import { createQueue } from "../lib/generators";
import * as vp from "./viewports";
import { printError } from "../lib/errors";

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

  /* WHY: Requests route through the background service worker via
   * chrome.runtime so that rects from elements inside iframes can be
   * aggregated too. */
  async *aggregate(): AsyncGenerator<ElementRects[]> {
    if (this.callback) throw Error("Illegal state: already fetching");

    const { enqueue, dequeue } = createQueue<ElementRects[] | "Complete">();
    this.callback = (rects) => enqueue.next(rects);

    sendToRuntime("AllRectsRequest", {
      id: ++this.requestIndex,
      targetFrameId: 0,
      viewport: {
        type: "actual-viewport",
        origin: "root-viewport",
        x: 0,
        y: 0,
        ...vp.layout.sizes(),
      },
      offsets: { type: "layout-viewport", origin: "root-viewport", x: 0, y: 0 },
    }).catch(printError);

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
    // INVARIANT: Provide undefined to execute no action.
    elementId: ElementId | undefined,
    options: ActionOptions,
  ) {
    if (!this.callback) throw Error("Illegal state: not aggregating");
    /* WHY: Clear the callback synchronously before signalling "Complete" (which
     * ends the aggregate() loop on a later micro-task) so a second aggregate()
     * call from a concurrent AttachHints does not throw "already fetching". */
    const callback = this.callback;
    this.callback = null;
    callback("Complete");
    if (elementId)
      return sendToRuntime("ExecuteAction", { id: elementId, options });
  }
}
