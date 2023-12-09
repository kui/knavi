import { flatMap, filter, first, takeWhile, length, map } from "./iters";
import { isScrollable, listAll, traverseParent } from "./elements";
import VisibleRectDetector from "./visible-rect-detector";
import CachedFetcher from "./cached-fetcher";
import type { Rect } from "./rects";

const HINTABLE_QUERY = [
  "a[href]",
  "area[href]",
  "details",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([type=hidden]):not([disabled])",
  "iframe",
  "[tabindex]",
  "[onclick]",
  "[onmousedown]",
  "[onmouseup]",
  "[contenteditable='']",
  "[contenteditable=true]",
  "[role=link]",
  "[role=button]",
  "[data-image-url]",
];

interface ElementRects {
  element: Element;
  rects: Rect<"element-border", "actual-viewport">[];
  clickable: true | "maybe";
  filteredOutBy?: ElementRects;
}

export class RectAggregator {
  private readonly detector: VisibleRectDetector;
  private readonly selector: string;

  constructor(
    viewport: Rect<"actual-viewport", "layout-viewport">,
    additionalSelectors: string[],
    clientRectsFetcher: CachedFetcher<
      Element,
      Rect<"element-border", "layout-viewport">[]
    >,
    private readonly styleFetcher: CachedFetcher<
      Element,
      StylePropertyMapReadOnly
    >,
  ) {
    this.detector = new VisibleRectDetector(
      viewport,
      clientRectsFetcher,
      styleFetcher,
    );
    this.selector = [...HINTABLE_QUERY, ...additionalSelectors].join(",");
  }

  get() {
    const visibles = [...this.getVisibles()];
    console.debug("visibles", visibles);
    const distincteds = this.distinctSimilarTarget(visibles);
    console.debug("distinct visibles", distincteds);
    return distincteds;
  }

  // TODO Integrate with ActionHandler
  *getVisibles(): Generator<ElementRects> {
    for (const element of listAll()) {
      if (
        !element.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      )
        continue;

      const clickable = this.isClickable(element);
      if (!clickable) continue;

      const rects = this.detector.get(element);
      if (rects.length === 0) continue;

      yield { element, rects, clickable };
    }
  }

  private isClickable(element: Element): boolean | "maybe" {
    if (element.matches(this.selector)) return true;

    const style = this.styleFetcher.get(element);
    if (
      ["pointer", "zoom-in", "zoom-out"].includes(
        style.get("cursor")!.toString()!,
      )
    )
      return "maybe";
    if (isScrollable(element, style)) return true;

    return false;
  }

  // TODO refactor
  private distinctSimilarTarget(targets: ElementRects[]) {
    const targetMap = new Map(map(targets, (t) => [t.element, t]));
    const detector = this.detector;

    function isVisibleNode(node: Node) {
      // filter out blank text nodes
      if (node instanceof Text) return !/^\s*$/.test(node.data);
      // filter out invisible element.
      if (node instanceof Element) {
        if (detector.get(node).length >= 1) return true;
        return false;
      }
      return true;
    }

    function removeFilteredOutElements() {
      for (const [element, target] of targetMap.entries()) {
        if (target.filteredOutBy) targetMap.delete(element);
      }
    }

    let maybeClickables = targets.filter((t) => t.clickable === "maybe");

    // Filter out targets which are children of <a> or <button>
    for (const target of maybeClickables) {
      const parentTarget = first(
        flatMap(traverseParent(target.element), (p) => {
          const t = targetMap.get(p);
          if (t == null) return [];
          if (t.filteredOutBy) return [t.filteredOutBy];
          if (["A", "BUTTON"].includes(t.element.tagName)) return [t];
          return [];
        }),
      );
      if (parentTarget) {
        target.filteredOutBy = parentTarget;
        console.debug(
          "filter out: a child of a parent <a>/<button>: target=%o",
          target.element,
        );
      }
    }

    maybeClickables = maybeClickables.filter((t) => !t.filteredOutBy);
    removeFilteredOutElements();

    // Filter out targets that is only one child for a parent that is target too.
    for (const target of maybeClickables) {
      if (target.filteredOutBy) continue;

      const thinAncestors = takeWhile(
        traverseParent(target.element),
        (e) => length(filter(e.childNodes, isVisibleNode)) === 1,
      );
      const parentTarget = first(
        flatMap(thinAncestors, (p) => {
          const t = targetMap.get(p);
          if (!t) return [];
          if (t.filteredOutBy) return [t.filteredOutBy];
          return [t];
        }),
      );
      if (parentTarget) {
        target.filteredOutBy = parentTarget;
        console.debug(
          "filter out: a child of a thin parent: target=%o",
          target.element,
        );
      }
    }

    maybeClickables = maybeClickables.filter((t) => !t.filteredOutBy);
    removeFilteredOutElements();

    // Filter out targets that contains only existing targets
    for (let i = maybeClickables.length - 1; i >= 0; i--) {
      const target = maybeClickables[i];
      if (target.filteredOutBy) continue;

      const childNodes = Array.from(
        filter(target.element.children, isVisibleNode),
      );
      if (childNodes.every((c) => targetMap.has(c))) {
        const child = childNodes[0];
        target.filteredOutBy = targetMap.get(child);
        console.debug(
          "filter out: only targets containing: target=%o",
          target.element,
        );
      }
    }

    return targets.filter((t) => !t.filteredOutBy);
  }
}
