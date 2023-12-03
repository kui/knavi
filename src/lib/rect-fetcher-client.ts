import * as vp from "./viewports";
import { sendToRuntime } from "./chrome-messages";
import { postMessageTo } from "./dom-messages";
import { createQueue } from "./generators";

export class RectFetcherClient {
  private requestIndex = 0;
  private callback:
    | ((elementRects: ElementRects[] | "Complete") => void)
    | null = null;

  constructor() {
    if (window !== window.parent) {
      throw Error("RectFetcherClient should be created in top frame");
    }
  }

  // Fetch all rects include elements inside iframe.
  // Requests are thrown by `postMessage` (frame message passing),
  async *fetch(): AsyncGenerator<ElementRects[]> {
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
        this.callback = null;
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
      console.warn("Not fetching phase: ", rects);
      return;
    }
    this.callback(rects);
  }

  getDescriptions(elementId: ElementId) {
    if (!this.callback) throw Error("Illegal state: not fetching");
    return sendToRuntime("GetDescriptions", { id: elementId });
  }

  action(
    // Provide null to execute no action.
    elementId: ElementId | null,
    options: ActionOptions,
  ) {
    if (!this.callback) throw Error("Illegal state: not fetching");
    this.callback("Complete");
    if (elementId)
      return sendToRuntime("ExecuteAction", { id: elementId, options });
  }
}
