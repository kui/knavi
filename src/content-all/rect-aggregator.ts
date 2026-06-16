import { ActionFinder } from "./action-handlers";
import { CachedFetcher } from "../lib/cache";
import { sendToRuntime } from "../lib/chrome-messages";
import { getClientRects, getContentRects, listAll } from "../dom/elements";
import { flatMap } from "../lib/iters";
import { Timers } from "../lib/metrics";
import { RectDetector } from "./rect-detector";
import { Coordinates, Rect } from "../dom/rects";
import settingsClient from "../lib/settings-client";
import { printWarn } from "../lib/errors";

interface ElementProfile {
  id: ElementId;
  element: Element;
  rects: Rect<"element-border", "root-viewport">[];
  descriptions: ActionDescriptions;
  handle: (options: ActionOptions) => Promise<void> | void;
  actualTarget?: HTMLElement | SVGElement;
}

export class RectAggregatorContentAll {
  private elements: ElementProfile[] = [];
  private readonly frameIdPromise = sendToRuntime("GetFrameId");

  constructor(private iframeMap: Map<number, HTMLIFrameElement>) {}

  async handleFetchRects(
    viewport: Rect<"actual-viewport", "root-viewport">,
    frameOffsets: Coordinates<"layout-viewport", "root-viewport">,
  ): Promise<ElementRects[]> {
    console.debug(
      "FetchRects viewport=",
      viewport,
      "frameOffsets=",
      frameOffsets,
      "location=",
      location.href,
    );

    // The received viewport is in root-viewport coords; convert to layout-viewport for detection.
    const actualViewport: Rect<"actual-viewport", "layout-viewport"> =
      viewport.offsets(frameOffsets);

    const clientRectsFetcher = new CachedFetcher((e: Element) =>
      getClientRects(e),
    );
    const styleFetcher = new CachedFetcher((e: Element) =>
      e.computedStyleMap(),
    );

    console.time("aggregateRects");
    this.elements = await this.aggregateRects(
      viewport,
      actualViewport,
      clientRectsFetcher,
      styleFetcher,
    );
    console.timeEnd("aggregateRects");
    console.debug("Aggregate rects", this.elements);

    const localRects: ElementRects[] = this.elements.map((p) => ({
      id: p.id,
      rects: p.rects,
      descriptions: p.descriptions,
    }));

    const childResults = await this.propagateToChildren(
      viewport,
      frameOffsets,
      clientRectsFetcher,
      styleFetcher,
    );

    return [...localRects, ...childResults];
  }

  private async aggregateRects(
    viewport: Rect<"actual-viewport", "root-viewport">,
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

        // Translate from actual-viewport coords to root-viewport coords.
        // Under recursive cropping the viewport may sit at non-zero (x, y) in
        // layout-viewport space, so we must translate rather than just relabel.
        return [
          {
            id: { index, frameId },
            element,
            rects: rects.map((r) => r.offsets(viewport.reverse())),
            ...action,
          },
        ];
      }),
    ];
    timers.print();
    detector.printMetrics();
    return bondByActualTarget(elementProfiles);
  }

  private async propagateToChildren(
    viewport: Rect<"actual-viewport", "root-viewport">,
    frameOffsets: Coordinates<"layout-viewport", "root-viewport">,
    clientRectsFetcher: CachedFetcher<
      Element,
      Rect<"element-border", "layout-viewport">[]
    >,
    styleFetcher: CachedFetcher<Element, StylePropertyMapReadOnly>,
  ): Promise<ElementRects[]> {
    const childPromises: Promise<ElementRects[]>[] = [];

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

      // Convert content rect from layout-viewport to root-viewport coords.
      const contentRectInRoot = contentRect.offsets(frameOffsets.reverse());

      // Child viewport: intersect parent's viewport with the iframe's content area in root-viewport.
      const childViewport = Rect.intersection(
        "actual-viewport",
        viewport,
        contentRectInRoot,
      );
      if (!childViewport) continue; // iframe is fully outside the viewport — skip

      // Child frame's layout-viewport origin in root-viewport.
      const childFrameOffsets = new Coordinates<
        "layout-viewport",
        "root-viewport"
      >({
        type: "layout-viewport",
        origin: "root-viewport",
        x: contentRectInRoot.x,
        y: contentRectInRoot.y,
      });

      childPromises.push(
        sendToRuntime("RelayFetchRects", {
          childFrameId,
          viewport: childViewport,
          frameOffsets: childFrameOffsets,
        }).catch((e) => {
          printWarn(e);
          return [] as ElementRects[];
        }),
      );
    }

    const results = await Promise.all(childPromises);
    return results.flat();
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
    } else {
      elementProfileMap.set(profile.actualTarget, profile);
    }
    elementProfileMap.delete(profile.element);
  }
  return [...elementProfileMap.values()];
}
