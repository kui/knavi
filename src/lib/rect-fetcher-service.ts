import { filter, first } from "./iters";
import RectFetcher from "./rect-fetcher";
import ActionHandler from "./action-handlers";
import settingsClient from "./settings-client";
import * as vp from "./viewports";
import { Router, sendToRuntime } from "./chrome-messages";
import * as rectUtils from "./rects";
import CachedFetcher from "./cached-fetcher";

interface ElementProfile {
  element: Element;
  holder: {
    index: number;
    frameId: number;
    // The rects are relative to ***
    rects: Rect[];
  };
}

// Donot import from rect-fetcher-client because it might start event listeners
const ALL_RECTS_REQUEST_TYPE = "com.github.kui.knavi.AllRectsRequest";
const ALL_RECTS_RESPONSE_COMPLETE_TYPE =
  "com.github.kui.knavi.AllRectsResponseComplete";
const REGISTER_FRAME_TYPE = "com.github.kui.knavi.RegisterFrame";

export class RectFetcherService {
  private rectElements: ElementProfile[];
  private readonly actionHandler: ActionHandler;
  private readonly registeredFrames: Set<Window>;
  private readonly frameIdPromise: Promise<number>;

  constructor() {
    this.rectElements = [];
    this.actionHandler = new ActionHandler();
    this.registeredFrames = new Set();
    this.frameIdPromise = sendToRuntime("GetFrameId");
    if (parent !== window) {
      parent.postMessage({ type: REGISTER_FRAME_TYPE }, "*");
    }
  }

  router() {
    return Router.newInstance()
      .add("GetDescriptions", (req, sender, sendResponse) => {
        const { element } = this.rectElements[req.index];
        const descs = this.actionHandler.getDescriptions(element);
        sendResponse(descs);
      })
      .add("ExecuteAction", (req, sender, sendResponse) => {
        const { element } = this.rectElements[req.index];
        this.actionHandler.handle(element, req.options);
        sendResponse();
      });
  }

  handleMessage(event: MessageEvent<{ type?: string }>) {
    switch (event.data.type) {
      case ALL_RECTS_REQUEST_TYPE:
        this.handleAllRectsRequest(event.data as AllRectsRequest).catch(
          console.error,
        );
        return;
      case REGISTER_FRAME_TYPE:
        this.handleRegisterFrame(event);
        return;
    }
  }

  // TODO refactor
  async handleAllRectsRequest(req: AllRectsRequest) {
    console.debug("AllRectsRequest req=", req, "location=", location.href);

    const visualVpOffsets = vp.visual.offsets();
    const visualViewport = rectUtils.move(req.viewport, visualVpOffsets);
    const styleFetcher = new CachedFetcher((e: Element) => getComputedStyle(e));
    const clientRectsFetcher = new CachedFetcher(
      (e: Element) => Array.from(e.getClientRects()) as DOMRectReadOnly[],
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
    this.rectElements = rectFetcher
      .getAll(visualViewport)
      .map(({ element, rects }, index) => {
        rects = rects.map((r) => rectUtils.move(r, req.offsets));
        return { element, holder: { index, frameId, rects } } as ElementProfile;
      });

    console.debug(
      "rectElements",
      this.rectElements.map(({ element }) => element),
    );

    await sendToRuntime("ResponseRectsFragment", {
      holders: this.rectElements.map((e) => e.holder),
      clientFrameId: req.clientFrameId,
    });

    // Propagate requests to child frames
    // Child frames require to be visible by above rect detection, and
    // be registered by a init "RegisterFrame" message.
    const frames = new Set(
      filter(this.rectElements, ({ element }) => {
        return (
          "contentWindow" in element &&
          this.registeredFrames.has(element.contentWindow as Window)
        );
      }),
    );
    if (frames.size === 0) {
      console.debug("No frames", location.href);
      window.parent.postMessage(
        { type: ALL_RECTS_RESPONSE_COMPLETE_TYPE },
        "*",
      );
      return;
    }

    console.debug("Send request to child frames", location.href);

    const layoutVpOffsets = vp.layout.offsets();
    const layoutVpOffsetsFromRootVisualVp = {
      x: layoutVpOffsets.x - visualVpOffsets.x + req.offsets.x,
      y: layoutVpOffsets.y - visualVpOffsets.y + req.offsets.y,
    };
    for (const frame of frames) {
      // TODO Safe cast
      const element = frame.element as HTMLIFrameElement;
      const rects = clientRectsFetcher.get(element);
      const style = styleFetcher.get(element);
      const borderWidth = this.getBorderWidth(element, rects, style);
      const clientRect = rectUtils.move(
        clientRectsFetcher.get(element)[0],
        layoutVpOffsetsFromRootVisualVp,
      );
      const iframeViewport = rectUtils.excludeBorders(clientRect, borderWidth);
      const offsets = {
        x: iframeViewport.x,
        y: iframeViewport.x,
      };
      const croppedRect = frame.holder.rects[0];
      const viewport = rectUtils.intersection(croppedRect, iframeViewport);
      if (!viewport) {
        frames.delete(frame);
        continue;
      }
      element.contentWindow?.postMessage(
        {
          type: ALL_RECTS_REQUEST_TYPE,
          viewport: rectUtils.offsets(viewport, offsets),
          offsets,
          clientFrameId: req.clientFrameId,
        },
        "*",
      );
    }
    if (frames.size === 0) {
      console.debug("No visible frames", location.href);
      window.parent.postMessage(
        { type: ALL_RECTS_RESPONSE_COMPLETE_TYPE },
        "*",
      );
      return;
    }

    // Fetching complete timeout
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      console.warn(
        "Timeout: no response child frames=",
        frames,
        "location=",
        location.href,
      );
      window.parent.postMessage(
        { type: ALL_RECTS_RESPONSE_COMPLETE_TYPE },
        "*",
      );
      window.removeEventListener("message", responseCompleteHandler);
    }, 1000);

    // Handle reqest complete
    // TODO Exporse message handlers
    const responseCompleteHandler = (
      event: MessageEvent<{ type?: string }>,
    ) => {
      if (event.source === window) return;
      if (event.data.type !== ALL_RECTS_RESPONSE_COMPLETE_TYPE) return;

      const frame = first(
        filter(
          frames.values(),
          ({ element }) =>
            (element as HTMLIFrameElement).contentWindow === event.source,
        ),
      );
      if (!frame) return;
      frames.delete(frame);
      console.debug("Request complete: ", frame, "frames.size=", frames.size);

      if (frames.size === 0) {
        window.parent.postMessage(
          { type: ALL_RECTS_RESPONSE_COMPLETE_TYPE },
          "*",
        );
        window.removeEventListener("message", responseCompleteHandler);
        clearTimeout(timeoutId);
      }
    };

    window.addEventListener("message", responseCompleteHandler);
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

  handleRegisterFrame(event: MessageEvent) {
    const frame = event.source;
    if (!(frame instanceof Window)) return;
    if (this.registeredFrames.has(frame)) return;
    // "frame" cannot be touched in this phase because of the cross-origin frame
    // console.debug("New child frame", frame, "parent-location=", location.href);
    console.debug("New child frame: parent-location=", location.href);
    this.registeredFrames.add(frame);
  }
}
