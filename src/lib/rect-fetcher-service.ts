import RectFetcher from "./rect-fetcher";
import ActionHandler from "./action-handlers";
import settingsClient from "./settings-client";
import * as vp from "./viewports";
import { Router, sendToRuntime } from "./chrome-messages";
import * as rectUtils from "./rects";
import CachedFetcher from "./cached-fetcher";
import { postMessageTo } from "./dom-messages";

interface ElementProfile {
  element: Element;
  holder: {
    index: number;
    frameId: number;
    // The rects are relative to ***
    rects: Rect[];
  };
}

export class RectFetcherService {
  private rectElements: ElementProfile[];
  private readonly actionHandler: ActionHandler;
  private readonly frameIdPromise: Promise<number>;

  constructor() {
    this.rectElements = [];
    this.actionHandler = new ActionHandler();
    this.frameIdPromise = sendToRuntime("GetFrameId");
  }

  router() {
    return Router.newInstance()
      .add("GetDescriptions", (message) => {
        const { element } = this.rectElements[message.index];
        return this.actionHandler.getDescriptions(element);
      })
      .add("ExecuteAction", (message) => {
        const { element } = this.rectElements[message.index];
        this.actionHandler.handle(element, message.options);
      });
  }

  // TODO refactor
  async handleAllRectsRequest(
    // The visual viewport relative to the root frame.
    // This is cropped by the root frame's visual viewport.
    currentVisualViewport: Rect,
    // Coordinates of current frame relative to the root frame.
    frameOffsets: Coordinates,
  ) {
    console.debug(
      "AllRectsRequest currentVisualViewport=",
      currentVisualViewport,
      "frameOffsets=",
      frameOffsets,
      "location=",
      location.href,
    );

    const styleFetcher = new CachedFetcher((e: Element) => getComputedStyle(e));
    const clientRectsFetcher = new CachedFetcher((e: Element) =>
      Array.from(e.getClientRects()),
    );
    this.rectElements = await this.fetchRects(
      currentVisualViewport,
      frameOffsets,
      clientRectsFetcher,
      styleFetcher,
    );

    console.debug(
      "rectElements",
      this.rectElements.map(({ element }) => element),
    );

    await sendToRuntime("ResponseRectsFragment", {
      holders: this.rectElements.map((e) => e.holder),
    });

    // Propagate requests to child frames
    // Child frames require to be visible by above rect detection, and
    // be registered by a init "RegisterFrame" message.
    const layoutVpOffsetsFromRootVvp = rectUtils.offsets(
      frameOffsets,
      vp.visual.offsetsFromLayoutVp(),
    );
    for (const frame of this.rectElements) {
      const element = frame.element;
      if (!(element instanceof HTMLIFrameElement)) continue;
      if (!element.contentWindow) {
        console.debug("No contentWindow to post message", element);
        continue;
      }
      const rects = clientRectsFetcher.get(element);
      const style = styleFetcher.get(element);
      const clientRectFromRootVvp = rectUtils.move(
        clientRectsFetcher.get(element)[0],
        layoutVpOffsetsFromRootVvp,
      );
      const iframeViewportFromRootVvp = rectUtils.excludeBorders(
        clientRectFromRootVvp,
        this.getBorderWidth(element, rects, style),
      );
      const croppedRect = frame.holder.rects[0];
      const actualIframeViewportFromRootVvp = rectUtils.intersection(
        croppedRect,
        iframeViewportFromRootVvp,
      );
      if (!actualIframeViewportFromRootVvp) {
        console.debug("No viewport", croppedRect, iframeViewportFromRootVvp);
        continue;
      }
      const requestPayload = {
        viewport: actualIframeViewportFromRootVvp,
        offsets: {
          x: iframeViewportFromRootVvp.x,
          y: iframeViewportFromRootVvp.y,
        },
      };
      postMessageTo(
        element.contentWindow,
        "com.github.kui.knavi.AllRectsRequest",
        requestPayload,
      );
    }
  }

  async fetchRects(
    currentVisualViewport: Rect,
    // Coordinates of current frame relative to the root frame.
    frameOffsets: Coordinates,
    clientRectsFetcher: CachedFetcher<Element, DOMRect[]>,
    styleFetcher: CachedFetcher<Element, CSSStyleDeclaration>,
  ): Promise<ElementProfile[]> {
    // Don't use `vp.visual.rect()` because it is not cropped by the root frame.
    const actualVisualViewport = rectUtils.offsets(
      currentVisualViewport,
      frameOffsets,
    );

    const additionalSelectors = await settingsClient.matchAdditionalSelectors(
      location.href,
    );
    const rectFetcher = new RectFetcher(
      additionalSelectors,
      clientRectsFetcher,
      styleFetcher,
    );
    const frameId = await this.frameIdPromise;
    return rectFetcher.getAll(actualVisualViewport).map(
      (
        {
          element,
          // relative to the visual viewport.
          rects,
        },
        index,
      ) => {
        // Make rects relative to the root frame.
        rects = rects.map((r) => rectUtils.move(r, currentVisualViewport));
        return { element, holder: { index, frameId, rects } };
      },
    );
  }

  // TODO better way to get border width
  getBorderWidth(
    element: HTMLElement,
    rects: DOMRectReadOnly[],
    style: CSSStyleDeclaration,
  ) {
    function f(
      direction: "top" | "bottom" | "left" | "right",
      rectIndex: number | "last",
      sizeName: "height" | "width",
    ) {
      const propName = `border-${direction}-width`;
      if (/^0(?:\D*)$|^$/.test(style.getPropertyValue(propName))) return 0;
      const prevValue = element.style.getPropertyValue(propName);
      element.style.setProperty(propName, "0");
      const index = rectIndex === "last" ? rects.length - 1 : rectIndex;
      const w =
        rects[index][sizeName] - element.getClientRects()[index][sizeName];
      element.style.setProperty(propName, prevValue);
      return w;
    }

    return {
      top: f("top", 0, "height"),
      bottom: f("bottom", 0, "height"),
      left: f("left", 0, "width"),
      right: f("right", "last", "width"),
    };
  }
}
