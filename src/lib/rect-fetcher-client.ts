import * as vp from "./viewports.js";
import { sendToRuntime, Router } from "./chrome-messages.js";
import { wait } from "./promises.js";

const ALL_RECTS_REQUEST_TYPE = "com.github.kui.knavi.AllRectsRequest";
const ALL_RECTS_RESPONSE_COMPLETE_TYPE =
  "com.github.kui.knavi.AllRectsResponseComplete";
const TIMEOUT_MS = 2000;

// TODO: Rename because this is not only to fetch rects but also to execute actions and get descriptions.
export class RectFetcherClient {
  private readonly frameIdPromise = sendToRuntime("GetFrameId").then((id) => {
    if (id !== 0)
      throw Error(`This script shoud run in top frame: frameId=${id}`);
    return id;
  });

  private callback:
    | ((
        arg:
          | { type: "complete" }
          | {
              type: "recieve";
              holders: RectHolder[];
            },
      ) => false) // return false to confirm handling for all types.
    | null = null;

  // Fetch all rects include elements inside iframe.
  // Requests are thrown by `postMessage` (frame message passing),
  // because the requests should reach only visible frames.
  // TODO Simplify this logic especially callback handling.
  async fetch(): Promise<RectHolder[]> {
    if (this.callback) throw Error("Illegal state: already fetching");

    const holders: RectHolder[] = [];
    const fetchingPromise = new Promise<void>((resolve) => {
      this.callback = (arg) => {
        switch (arg.type) {
          case "recieve":
            holders.push(...arg.holders);
            return false;
          case "complete":
            resolve();
            return false;
        }
      };
    });
    const timeout = wait(TIMEOUT_MS).then(() =>
      console.warn("Timeout: fetchAllRects"),
    );

    window.postMessage(
      {
        type: ALL_RECTS_REQUEST_TYPE,
        offsets: { x: 0, y: 0 },
        viewport: vp.visual.sizes(),
        clientFrameId: await this.frameIdPromise,
      },
      "*",
    );

    await Promise.race([fetchingPromise, timeout]);
    this.callback = null;
    return holders;
  }

  router() {
    return Router.newInstance().add(
      "ResponseRectsFragment",
      (res, sender, sendResponse) => {
        console.debug("RectsFragmentResponse", res);
        if (this.callback) {
          this.callback({ type: "recieve", holders: res.holders });
        } else {
          console.warn("Fetching phase is already completed.");
        }
        sendResponse();
      },
    );
  }

  handleMessage(event: MessageEvent<{ type?: string }>) {
    switch (event.data.type) {
      case ALL_RECTS_RESPONSE_COMPLETE_TYPE:
        this.handleAllRectsResponseComplete();
        return;
    }
  }

  private handleAllRectsResponseComplete() {
    if (this.callback) {
      this.callback({ type: "complete" });
    } else {
      console.warn("Fetching phase is already completed.");
    }
  }

  getDescriptions(elementId: { frameId: number; index: number }) {
    return sendToRuntime("GetDescriptions", elementId);
  }

  action(
    elementId: { frameId: number; index: number },
    options: ActionOptions,
  ) {
    return sendToRuntime("ExecuteAction", { ...elementId, options });
  }
}
