import { ActionFinder } from "./action-handlers";
import { CachedFetcher } from "../lib/cache";
import { getClientRects, getContentRects, listAll } from "../dom/elements";
import { flatMap } from "../lib/iters";
import { Timers } from "../lib/metrics";
import { RectDetector } from "./rect-detector";
import { Coordinates, Rect } from "../lib/rects";
import { sendToRuntime } from "../lib/chrome-messages";
import settingsClient from "../lib/settings-client";

interface ElementProfile {
  index: number;
  element: Element;
  rects: Rect<"element-border", "layout-viewport">[];
  descriptions: ActionDescriptions;
  handle: (options: ActionOptions) => Promise<void> | void;
  actualTarget?: HTMLElement | SVGElement;
}

export class RectAggregatorContentAll {
  private elements: ElementProfile[] = [];
  private frameId: number | null = null;

  constructor(private iframeMap: Map<number, HTMLIFrameElement>) {}

  async handleFetchRects(payload: {
    viewport: RectJSON<"actual-viewport", "layout-viewport">;
    rootOrigin: CoordinatesJSON<"root-viewport", "layout-viewport">;
  }): Promise<ElementRects[]> {
    console.debug("FetchRects location=", location.href);

    const viewport = new Rect(payload.viewport);
    const rootOrigin = new Coordinates(payload.rootOrigin);

    const clientRectsFetcher = new CachedFetcher((e: Element) =>
      getClientRects(e),
    );
    const styleFetcher = new CachedFetcher((e: Element) =>
      e.computedStyleMap(),
    );

    console.time("aggregateRects");
    this.elements = await this.aggregateRects(
      viewport,
      clientRectsFetcher,
      styleFetcher,
    );
    console.timeEnd("aggregateRects");
    console.debug("Aggregate rects", this.elements);

    const frameId = await this.getOwnFrameId();
    const localElementRects: ElementRects[] = this.elements.map((p) => ({
      id: { index: p.index, frameId },
      rects: p.rects.map((r) => r.offsets(rootOrigin)),
      descriptions: p.descriptions,
    }));

    const childResponses = await Promise.all(
      this.collectChildFetches(
        viewport,
        rootOrigin,
        clientRectsFetcher,
        styleFetcher,
      ),
    );

    return localElementRects.concat(...childResponses);
  }

  private async getOwnFrameId(): Promise<number> {
    this.frameId ??= await sendToRuntime("GetFrameId");
    return this.frameId;
  }

  private collectChildFetches(
    viewport: Rect<"actual-viewport", "layout-viewport">,
    rootOrigin: Coordinates<"root-viewport", "layout-viewport">,
    clientRectsFetcher: CachedFetcher<
      Element,
      Rect<"element-border", "layout-viewport">[]
    >,
    styleFetcher: CachedFetcher<Element, StylePropertyMapReadOnly>,
  ): Promise<ElementRects[]>[] {
    const fetches: Promise<ElementRects[]>[] = [];

    for (const [childFrameId, iframe] of this.iframeMap) {
      if (!iframe.isConnected) {
        this.iframeMap.delete(childFrameId);
        continue;
      }

      const borderRects = clientRectsFetcher.get(iframe);
      const borderRect = borderRects[0];
      if (!borderRect) continue;

      const [contentRect] = getContentRects(
        iframe,
        borderRects,
        styleFetcher.get(iframe),
      );
      if (!contentRect) continue;

      // Intersect the child's content box with the ancestor-cropped viewport.
      // Off-screen iframes are skipped here so they neither receive a message
      // nor do any detection work.
      const visibleInParent = Rect.intersectionAs(
        "actual-viewport",
        contentRect,
        viewport,
      );
      if (!visibleInParent) continue;

      // Re-express the child's content-box origin as the child's layout-viewport origin.
      const contentCoord = new Coordinates({
        type: "element-content",
        origin: "layout-viewport",
        x: contentRect.x,
        y: contentRect.y,
      });
      const childViewport: RectJSON<"actual-viewport", "layout-viewport"> =
        new Rect({
          ...visibleInParent.offsets(contentCoord),
          origin: "layout-viewport",
        });
      const childRootOrigin: CoordinatesJSON<
        "root-viewport",
        "layout-viewport"
      > = new Coordinates({
        ...rootOrigin.offsets(contentCoord),
        origin: "layout-viewport",
      });

      fetches.push(
        sendToRuntime("RelayFetchRects", {
          childFrameId,
          viewport: childViewport,
          rootOrigin: childRootOrigin,
        }),
      );
    }

    return fetches;
  }

  private async aggregateRects(
    actualViewport: Rect<"actual-viewport", "layout-viewport">,
    clientRectsFetcher: CachedFetcher<
      Element,
      Rect<"element-border", "layout-viewport">[]
    >,
    styleFetcher: CachedFetcher<Element, StylePropertyMapReadOnly>,
  ): Promise<ElementProfile[]> {
    const additionalSelectors = await settingsClient.matchAdditionalSelectors(
      location.href,
    );
    const actionFinder = new ActionFinder(additionalSelectors);
    const detector = new RectDetector(
      actualViewport,
      clientRectsFetcher,
      styleFetcher,
    );
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

        // RectDetector returns rects in actual-viewport coordinates (its
        // origin is the viewport's top-left). Under recursive cropping the
        // viewport may sit at non-zero (x, y) in layout-viewport space, so we
        // must add the viewport offset back rather than just relabeling.
        const layoutRects = rects.map((r) =>
          new Rect(r).offsets(actualViewport.reverse()),
        );

        return [
          {
            index,
            element,
            rects: layoutRects,
            ...action,
          },
        ];
      }),
    ];
    timers.print();
    detector.printMetrics();
    return bondByActualTarget(elementProfiles);
  }

  async handleExecuteAction(index: number, options: ActionOptions) {
    const e = this.elements.find((e) => e.index === index);
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
    } else {
      elementProfileMap.set(profile.actualTarget, profile);
    }
    elementProfileMap.delete(profile.element);
  }
  return [...elementProfileMap.values()];
}
