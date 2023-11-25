import * as vp from "./viewports";
import { sendToRuntime, Router } from "./chrome-messages";
import { postMessageTo } from "./dom-messages";

// TODO: Rename because this is not only to fetch rects but also to execute actions and get descriptions.
export class RectFetcherClient {
  private callback: ((holders: RectHolder[]) => void) | null = null;

  constructor() {
    if (window !== window.parent) {
      throw Error("RectFetcherClient should be created in top frame");
    }
  }

  // Fetch all rects include elements inside iframe.
  // Requests are thrown by `postMessage` (frame message passing),
  // TODO Simplify this logic especially callback handling.
  async *fetch(): AsyncGenerator<RectHolder[]> {
    if (this.callback) throw Error("Illegal state: already fetching");

    postMessageTo(window, "com.github.kui.knavi.AllRectsRequest", {
      offsets: { x: 0, y: 0 },
      viewport: vp.visual.rect(),
    });

    while (true) {
      yield await this.awaitFetch();
      if (!this.callback) break;
    }
  }

  async awaitFetch(): Promise<RectHolder[]> {
    return new Promise<RectHolder[]>((resolve) => (this.callback = resolve));
  }

  router() {
    return Router.newInstance().add("ResponseRectsFragment", (message) => {
      if (this.callback) {
        this.callback(message.holders);
      }
    });
  }

  getDescriptions(elementId: { frameId: number; index: number }) {
    if (!this.callback) throw Error("Illegal state: not fetching");
    return sendToRuntime("GetDescriptions", elementId);
  }

  action(
    // Provide null to execute no action.
    elementId: { frameId: number; index: number } | null,
    options: ActionOptions,
  ) {
    if (!this.callback) throw Error("Illegal state: not fetching");
    const callback = this.callback;
    this.callback = null;
    callback([]);
    if (elementId)
      return sendToRuntime("ExecuteAction", { ...elementId, options });
  }
}
