import { flatMap, filter, first, takeWhile, length, map } from "./iters";
import { isScrollable, traverseParent } from "./elements";
import * as vp from "./viewports";
import * as rects from "./rects";
import VisibleRectDetector from "./visible-rect-detector";
import CachedFetcher from "./cached-fetcher";

interface ElementRects {
  element: Element;
  // The rects are relative to "visual viewport".
  rects: Rect[];
  maybeClickable: boolean;
  filteredOutBy?: ElementRects;
}

// TODO refactor
export default class RectFetcher {
  readonly styleCache: CachedFetcher<Element, CSSStyleDeclaration>;
  readonly detector: VisibleRectDetector;
  readonly additionalSelectors: string[];

  constructor(
    additionalSelectors: string[],
    clientRectsFetcher: CachedFetcher<Element, DOMRect[]>,
    styleFetcher: CachedFetcher<Element, CSSStyleDeclaration>,
  ) {
    this.styleCache = styleFetcher;
    this.detector = new VisibleRectDetector(clientRectsFetcher, styleFetcher);
    this.additionalSelectors = additionalSelectors;
  }

  getAll(visualViewport: Rect) {
    const visualVpFromLayoutVp = rects.offsets(
      visualViewport,
      vp.layout.offsets(),
    );
    const t = listAllTarget(this, visualVpFromLayoutVp);
    return distinctSimilarTarget(this, t, visualVpFromLayoutVp);
  }
}

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

function listAllTarget(self: RectFetcher, viewport: Rect) {
  const selector = [...HINTABLE_QUERY, ...self.additionalSelectors].join(",");

  function buildTarget(element: Element): ElementRects | null {
    const clickableness = deriveClickableness(element);
    if (!clickableness) return null;

    const rects = self.detector.get(element, viewport);
    if (rects.length === 0) return null;

    return { element, rects, ...clickableness };
  }

  function deriveClickableness(
    element: Element,
  ): { maybeClickable: boolean } | null {
    if (element.matches(selector)) {
      return { maybeClickable: false };
    }

    const style = self.styleCache.get(element);
    if (["pointer", "zoom-in", "zoom-out"].includes(style.cursor)) {
      return { maybeClickable: true };
    }
    if (isScrollable(element, style)) {
      return { maybeClickable: false };
    }

    return null;
  }

  function listTargets(doc: Document | ShadowRoot): ElementRects[] {
    return Array.from(
      flatMap(doc.querySelectorAll("*"), (element) => {
        let childTargets: ElementRects[];
        if (element.shadowRoot) {
          childTargets = listTargets(element.shadowRoot);
        } else {
          childTargets = [];
        }

        const target = buildTarget(element);
        return target ? [target, ...childTargets] : childTargets;
      }),
    );
  }

  const startMsec = performance.now();
  const targets = listTargets(document);
  const elapsedMsec = performance.now() - startMsec;

  console.debug(
    "list all elements: elapsedMsec=",
    elapsedMsec,
    "targetElements=",
    targets.length,
  );

  return targets;
}

function distinctSimilarTarget(
  self: RectFetcher,
  targets: ElementRects[],
  viewport: Rect,
) {
  const targetMap = new Map(map(targets, (t) => [t.element, t]));

  function isVisibleNode(node: Node) {
    // filter out blank text nodes
    if (node instanceof Text) return !/^\s*$/.test(node.data);
    // filter out invisible element.
    if (node instanceof Element) {
      if (self.detector.get(node, viewport).length >= 1) return true;
      return false;
    }
    return true;
  }

  function removeFilteredOutElements() {
    for (const [element, target] of targetMap.entries()) {
      if (target.filteredOutBy) targetMap.delete(element);
    }
  }

  let maybeClickables = targets.filter((t) => t.maybeClickable);

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
