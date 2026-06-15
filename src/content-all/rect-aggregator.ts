import { ActionFinder } from "./action-handlers";
import { CachedFetcher } from "../lib/cache";
import { getClientRects, getContentRects, listAll } from "../dom/elements";
import { flatMap } from "../lib/iters";
import { Timers } from "../lib/metrics";
import { RectDetector } from "./rect-detector";
import { Coordinates, Rect } from "../dom/rects";
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

  constructor(private iframeMap: Map<number, HTMLIFrameElement>) {}

  async handleFetchFrameRects() {
    console.debug("FetchFrameRects location=", location.href);

    const clientRectsFetcher = new CachedFetcher((e: Element) =>
      getClientRects(e),
    );
    const styleFetcher = new CachedFetcher((e: Element) =>
      e.computedStyleMap(),
    );

    const viewport = buildLocalViewport();

    console.time("aggregateRects");
    this.elements = await this.aggregateRects(
      viewport,
      clientRectsFetcher,
      styleFetcher,
    );
    console.timeEnd("aggregateRects");
    console.debug("Aggregate rects", this.elements);

    const childIframes = collectChildIframes(
      this.iframeMap,
      viewport,
      clientRectsFetcher,
      styleFetcher,
    );

    return {
      elements: this.elements.map((p) => ({
        index: p.index,
        rects: p.rects,
        descriptions: p.descriptions,
      })),
      childIframes,
    };
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

        // getBoundingClientRect() in Chrome returns coordinates relative to the
        // layout viewport (initial containing block). buildLocalViewport() places
        // the actual-viewport origin at (0,0) in layout-viewport space, so the
        // numeric values are already in the layout-viewport system; we only need
        // to relabel the origin. (This may differ on browsers where the API uses
        // the visual viewport as its reference.)
        const layoutRects = rects.map(
          (r) =>
            new Rect<"element-border", "layout-viewport">({
              ...r,
              origin: "layout-viewport",
            }),
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

function buildLocalViewport(): Rect<"actual-viewport", "layout-viewport"> {
  return new Rect({
    type: "actual-viewport",
    origin: "layout-viewport",
    x: 0,
    y: 0,
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  });
}

function collectChildIframes(
  iframeMap: Map<number, HTMLIFrameElement>,
  viewport: Rect<"actual-viewport", "layout-viewport">,
  clientRectsFetcher: CachedFetcher<
    Element,
    Rect<"element-border", "layout-viewport">[]
  >,
  styleFetcher: CachedFetcher<Element, StylePropertyMapReadOnly>,
) {
  const result: {
    childFrameId: number;
    contentOffsets: CoordinatesJSON<"element-content", "layout-viewport">;
    visibleViewport: RectJSON<"actual-viewport", "layout-viewport">;
  }[] = [];

  for (const [childFrameId, iframe] of iframeMap) {
    if (!iframe.isConnected) {
      iframeMap.delete(childFrameId);
      continue;
    }

    const [contentRect] = getContentRects(
      iframe,
      clientRectsFetcher.get(iframe),
      styleFetcher.get(iframe),
    );
    if (!contentRect) continue;

    const borderRect = (clientRectsFetcher.get(iframe) ?? [])[0];
    if (!borderRect) continue;

    const visibleViewport = Rect.intersection(
      "actual-viewport",
      borderRect,
      viewport,
    );

    if (!visibleViewport) continue;

    result.push({
      childFrameId,
      contentOffsets: new Coordinates({
        type: "element-content",
        origin: "layout-viewport",
        x: contentRect.x,
        y: contentRect.y,
      }),
      visibleViewport: new Rect({
        ...visibleViewport,
        origin: "layout-viewport",
      }),
    });
  }

  return result;
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
