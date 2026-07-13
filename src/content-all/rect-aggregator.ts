import { ActionFinder } from "./action-handlers";
import { CachedFetcher } from "../lib/cache";
import { sendToRuntime } from "../lib/chrome-messages";
import { getClientRects, getContentRects, listAll } from "../dom/elements";
import { flatMap } from "../lib/iters";
import { Timers } from "../lib/metrics";
import { RectDetector } from "./rect-detector";
import { Coordinates, Rect } from "../dom/rects";
import settingsClient from "../lib/settings-client";
import { printError } from "../lib/errors";
import { FrameRegistry } from "./frame-registration";

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
  private readonly frameIdPromise = sendToRuntime("GetFrameId", undefined);

  constructor(private readonly frameRegistry: FrameRegistry) {}

  async handleAllRectsRequest(
    requestId: number,
    currentViewport: Rect<"actual-viewport", "root-viewport">,
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
    console.debug("Aggrigate rects", this.elements);

    await sendToRuntime("ResponseRectsFragment", {
      requestId,
      rects: this.elements,
    });

    await Promise.all(
      flatMap(this.elements, ({ element, rects }) =>
        element instanceof HTMLIFrameElement
          ? [this.propagateMessage(element, rects[0], context)]
          : [],
      ),
    );
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

  private async propagateMessage(
    frame: HTMLIFrameElement,
    rect: Rect<"element-border", "root-viewport"> | null,
    {
      requestId,
      frameOffsets,
      clientRectsFetcher,
      styleFetcher,
    }: AggregationContext,
  ) {
    if (!rect) return;

    if (!frame.isConnected) {
      console.debug("iframe no longer connected, skipping propagation", frame);
      return;
    }

    /**
     * WHY: polls until the child frame has completed its FrameIdAnnouncement
     * handshake. Under CI load the postMessage round-trip can arrive after
     * AllRectsRequest fan-out, so wait up to 300 ms before giving up.
     */
    let childFrameId = this.frameRegistry.getFrameId(frame);
    if (childFrameId == null) {
      for (let i = 0; i < 30; i++) {
        await new Promise<void>((r) => setTimeout(r, 10));
        childFrameId = this.frameRegistry.getFrameId(frame);
        if (childFrameId != null) break;
      }
    }
    if (childFrameId == null) {
      console.debug(
        "iframe not registered after retries, skipping propagation",
        frame,
      );
      return;
    }

    const [contentRect] = getContentRects(
      frame,
      clientRectsFetcher.get(frame),
      styleFetcher.get(frame),
    ).map((r) => r.offsets(frameOffsets.reverse()));
    if (!contentRect) {
      console.warn("No content rects", frame);
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

    sendToRuntime("AllRectsRequest", {
      id: requestId,
      targetFrameId: childFrameId,
      viewport: iframeViewport,
      offsets: { ...contentRect, type: "layout-viewport" as const },
    }).catch(printError);
  }

  async handleExecuteAction(index: number, options: ActionOptions) {
    const e = this.elements.find((e) => e.id.index === index);
    console.debug("handleExecuteAction", index, e);
    if (!e) throw new Error(`No element with index ${index}`);
    await e.handle(options);
  }
}

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
    } else {
      elementProfileMap.set(profile.actualTarget, profile);
    }
    elementProfileMap.delete(profile.element);
  }
  return [...elementProfileMap.values()];
}
