import { ActionFinder } from "./action-handlers";
import { CachedFetcher } from "./cache";
import { sendToRuntime } from "./chrome-messages";
import { postMessageTo } from "./dom-messages";
import { getClientRects, getContentRects, listAll } from "./elements";
import { flatMap } from "./iters";
import { Timers } from "./metrics";
import { RectDetector } from "./rect-detector";
import { Coordinates, Rect } from "./rects";
import settingsClient from "./settings-client";

interface ElementProfile {
  id: ElementId;
  element: Element;
  rects: Rect<"element-border", "root-viewport">[];
  descriptions: ActionDescriptions;
  handle: (options: ActionOptions) => Promise<void> | void;
  actualTarget?: HTMLElement | SVGElement;
}

interface AggregationContext {
  requestId: number;
  currentViewport: Rect<"actual-viewport", "root-viewport">;
  frameOffsets: Coordinates<"layout-viewport", "root-viewport">;
  clientRectsFetcher: CachedFetcher<
    Element,
    Rect<"element-border", "layout-viewport">[]
  >;
  styleFetcher: CachedFetcher<Element, StylePropertyMapReadOnly>;
}

export class RectAggregatorContentAll {
  private elements: ElementProfile[] = [];
  private readonly actionFinder: ActionFinder | null = null;
  private readonly frameIdPromise = sendToRuntime("GetFrameId", undefined);

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

    const context: AggregationContext = {
      requestId,
      currentViewport,
      frameOffsets,
      clientRectsFetcher: new CachedFetcher((e: Element) => getClientRects(e)),
      styleFetcher: new CachedFetcher((e: Element) => e.computedStyleMap()),
    };

    console.time("aggregateRects");
    this.elements = await this.aggregateRects(context);
    console.timeEnd("aggregateRects");

    await sendToRuntime("ResponseRectsFragment", {
      requestId,
      rects: this.elements,
    });

    for (const { element, rects } of this.elements) {
      if (element instanceof HTMLIFrameElement)
        this.propergateMessage(element, rects[0], context);
    }
  }

  private async aggregateRects({
    currentViewport,
    frameOffsets,
    clientRectsFetcher,
    styleFetcher,
  }: AggregationContext): Promise<ElementProfile[]> {
    const actualViewport: Rect<"actual-viewport", "layout-viewport"> =
      currentViewport.offsets(frameOffsets);
    const additionalSelectors = await settingsClient.matchAdditionalSelectors(
      location.href,
    );
    const actionFinder = new ActionFinder(additionalSelectors);
    const detector = new RectDetector(
      actualViewport,
      clientRectsFetcher,
      styleFetcher,
    );
    const frameId = await this.frameIdPromise;
    const timers = new Timers("aggregateRects");
    const elementProfiles = [
      ...flatMap(listAll(), (element, index): ElementProfile[] => {
        let timerEnd = timers.start("detect");
        const rects = detector.detect(element);
        timerEnd();
        if (rects.length === 0) return [];

        timerEnd = timers.start("findAction");
        const action = actionFinder.find(element);
        timerEnd();
        if (!action) return [];

        return [
          {
            id: { index, frameId },
            element,
            rects: rects.map((r) => r.offsets(currentViewport.reverse())),
            ...action,
          },
        ];
      }),
    ];
    timers.print();
    detector.printMetrics();
    return bondByActualTarget(elementProfiles);
  }

  private propergateMessage(
    frame: HTMLIFrameElement,
    rect: Rect<"element-border", "root-viewport"> | null,
    {
      requestId,
      frameOffsets,
      clientRectsFetcher,
      styleFetcher,
    }: AggregationContext,
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

  async handleExecuteAction(index: number, options: ActionOptions) {
    const e = this.elements.find((e) => e.id.index === index);
    console.debug("handleExecuteAction", index, e);
    if (!e) throw new Error(`No element with index ${index}`);
    await e.handle(options);
  }
}

// Bond rects if they have same actual target.
function bondByActualTarget(
  elementProfiles: ElementProfile[],
): ElementProfile[] {
  const elementProfileMap = new Map(elementProfiles.map((e) => [e.element, e]));
  for (const profile of elementProfiles) {
    if (!profile.actualTarget) continue;
    if (profile.element === profile.actualTarget) continue;

    const actualTargetProfile = elementProfileMap.get(profile.actualTarget);
    if (actualTargetProfile) {
      actualTargetProfile.rects = profile.rects.reduce(
        (acc, r) => r.bondIfIntersect(acc),
        actualTargetProfile.rects,
      );
      elementProfileMap.delete(profile.element);
    } else {
      elementProfileMap.set(profile.actualTarget, profile);
    }
  }
  return [...elementProfileMap.values()];
}
