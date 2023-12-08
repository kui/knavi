import ActionHandler from "./action-handlers";
import CachedFetcher from "./cached-fetcher";
import { sendToRuntime } from "./chrome-messages";
import { postMessageTo } from "./dom-messages";
import { getClientRects, getContentRects } from "./elements";
import RectFetcher from "./rect-fetcher";
import { Coordinates, Rect } from "./rects";
import settingsClient from "./settings-client";

interface ElementProfile {
  element: Element;
  holder: {
    id: ElementId;
    rects: Rect<"element-border", "root-viewport">[];
  };
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
      rects: this.rectElements.map((e) => e.holder),
    });

    for (const frame of this.rectElements) {
      this.propergateMessage(frame, context);
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
      element,
      holder: {
        id: { index, frameId },
        rects: rects.map((r) => r.offsets(currentViewport.reverse())),
      },
    }));
  }

  private propergateMessage(
    elementProfile: ElementProfile,
    { requestId, frameOffsets, clientRectsFetcher, styleFetcher }: FetchContext,
  ) {
    const element = elementProfile.element;
    if (!(element instanceof HTMLIFrameElement)) return;
    if (!element.contentWindow) {
      console.debug("No contentWindow to post message", element);
      return;
    }
    const croppedRect = elementProfile.holder.rects[0];
    if (!croppedRect) return;

    const contentRects = getContentRects(
      element,
      clientRectsFetcher.get(element),
      styleFetcher.get(element),
    ).map((r) => r.offsets(frameOffsets.reverse()));
    if (contentRects.length === 0) {
      console.warn("No conent rects", element);
      return;
    }
    const iframeViewport = Rect.intersection(
      "actual-viewport",
      croppedRect,
      contentRects[0],
    );
    if (!iframeViewport) {
      console.debug("No viewport", croppedRect, contentRects);
      return;
    }

    postMessageTo(
      element.contentWindow,
      "com.github.kui.knavi.AllRectsRequest",
      {
        id: requestId,
        viewport: iframeViewport,
        offsets: { ...contentRects[0], type: "layout-viewport" },
      },
    );
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
