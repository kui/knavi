import ActionHandler from "./action-handlers";
import CachedFetcher from "./cached-fetcher";
import { sendToRuntime } from "./chrome-messages";
import { postMessageTo } from "./dom-messages";
import { getClientRects, getContentRects } from "./elements";
import RectFetcher from "./rect-fetcher";
import { Coordinates, Rect } from "./rects";
import settingsClient from "./settings-client";

interface ElementProfile {
  id: ElementId;
  element: Element;
  rects: Rect<"element-border", "root-viewport">[];
}

interface FetchContext {
  requestId: number;
  currentViewport: Rect<"actual-viewport", "root-viewport">;
  frameOffsets: Coordinates<"layout-viewport", "root-viewport">;
  clientRectsFetcher: CachedFetcher<
    Element,
    Rect<"element-border", "layout-viewport">[]
  >;
  styleFetcher: CachedFetcher<Element, StylePropertyMapReadOnly>;
}

export class RectFetcherContentAll {
  private rectElements: ElementProfile[];
  private readonly actionHandler: ActionHandler;
  private readonly frameIdPromise: Promise<number>;

  constructor() {
    this.rectElements = [];
    this.actionHandler = new ActionHandler();
    this.frameIdPromise = sendToRuntime("GetFrameId");
  }

  async handleAllRectsRequest(
    requestId: number,
    // Actual viewport of the current frame.
    // This is cropped by the root frame.
    currentViewport: Rect<"actual-viewport", "root-viewport">,
    // Coordinate of viewport of the current frame.
    // This coordinates could be negative because it could be out of the root frame.
    frameOffsets: Coordinates<"layout-viewport", "root-viewport">,
  ) {
    console.debug(
      "AllRectsRequest currentViewport=",
      currentViewport,
      "frameOffsets=",
      frameOffsets,
      "location=",
      location.href,
    );

    const context: FetchContext = {
      requestId,
      currentViewport,
      frameOffsets,
      clientRectsFetcher: new CachedFetcher((e: Element) => getClientRects(e)),
      styleFetcher: new CachedFetcher((e: Element) => e.computedStyleMap()),
    };
    this.rectElements = await this.fetchRects(context);
    await sendToRuntime("ResponseRectsFragment", {
      requestId,
      rects: this.rectElements,
    });

    for (const { element, rects } of this.rectElements) {
      if (element instanceof HTMLIFrameElement)
        this.propergateMessage(element, rects[0], context);
    }
  }

  private async fetchRects({
    currentViewport,
    frameOffsets,
    clientRectsFetcher,
    styleFetcher,
  }: FetchContext): Promise<ElementProfile[]> {
    const actualViewport: Rect<"actual-viewport", "layout-viewport"> =
      currentViewport.offsets(frameOffsets);
    const additionalSelectors = await settingsClient.matchAdditionalSelectors(
      location.href,
    );
    const rectFetcher = new RectFetcher(
      actualViewport,
      additionalSelectors,
      clientRectsFetcher,
      styleFetcher,
    );
    const frameId = await this.frameIdPromise;
    return rectFetcher.get().map(({ element, rects }, index) => ({
      id: { index, frameId },
      element,
      rects: rects.map((r) => r.offsets(currentViewport.reverse())),
    }));
  }

  private propergateMessage(
    frame: HTMLIFrameElement,
    rect: Rect<"element-border", "root-viewport"> | null,
    { requestId, frameOffsets, clientRectsFetcher, styleFetcher }: FetchContext,
  ) {
    if (!frame.contentWindow) {
      console.debug("No contentWindow to post message", frame);
      return;
    }
    if (!rect) return;

    const [contentRect] = getContentRects(
      frame,
      clientRectsFetcher.get(frame),
      styleFetcher.get(frame),
    ).map((r) => r.offsets(frameOffsets.reverse()));
    if (!contentRect) {
      console.warn("No conent rects", frame);
      return;
    }
    const iframeViewport = Rect.intersection(
      "actual-viewport",
      rect,
      contentRect,
    );
    if (!iframeViewport) {
      console.debug("No viewport", rect, contentRect);
      return;
    }

    postMessageTo(frame.contentWindow, "com.github.kui.knavi.AllRectsRequest", {
      id: requestId,
      viewport: iframeViewport,
      offsets: { ...contentRect, type: "layout-viewport" },
    });
  }

  handleGetDescription(index: number) {
    const { element } = this.rectElements[index];
    return this.actionHandler.getDescriptions(element);
  }

  async handleExecuteAction(index: number, options: ActionOptions) {
    const { element } = this.rectElements[index];
    await this.actionHandler.handle(element, options);
  }
}
