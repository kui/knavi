// @flow

import { flatMap, traverseParent, filter, first, takeWhile, length } from "./iters";
import { isScrollable } from "./utils";
import * as vp from "./viewports";
import * as rectUtils from "./rects";
import VisibleRectDetector from "./visible-rect-detector";

import type { Rect } from "./rects";
import type Cache from "./cache";
import type { DomCaches } from "./rect-fetcher-service";

export default class RectFetcher {
  detector: VisibleRectDetector;
  styleCache: Cache<HTMLElement, CSSStyleDeclaration>;
  additionalSelectors: string[];

  constructor(additionalSelectors: string[], caches: DomCaches) {
    this.styleCache = caches.style;
    this.detector = new VisibleRectDetector(caches);
    this.additionalSelectors = additionalSelectors;
  }

  getAll(visualViewport: Rect): { element: HTMLElement, rects: Rect[] }[] {
    const layoutVpOffsets = vp.layout.offsets();
    const visualViewportFromLayoutVp = rectUtils.offsets(visualViewport, layoutVpOffsets);
    const t = listAllTarget(this, visualViewportFromLayoutVp);
    return distinctSimilarTarget(this, t, visualViewportFromLayoutVp);
  }
}

declare interface Target {
  element: HTMLElement;
  rects: Rect[];
  mightBeClickable?: boolean;
  filteredOutBy?: ?Target;
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
].map((s) => "body /deep/ " + s).join(",");

function listAllTarget(self, viewport): Target[] {
  const selecteds = new Set(document.querySelectorAll(HINTABLE_QUERY));
  if (self.additionalSelectors.length >= 1) {
    const q = self.additionalSelectors.map((s) => "body /deep/ " + s).join(",");
    for (const e of document.querySelectorAll(q)) selecteds.add(e);
  }

  const targets: Target[] = [];

  let totalElements = 0;

  const startMsec = performance.now();
  for (const element of document.querySelectorAll("body /deep/ *")) {
    totalElements++;

    let isClickableElement = false;
    let mightBeClickable = false;
    let style = null;

    if (selecteds.has(element)) {
      isClickableElement = true;
    } else {
      style = self.styleCache.get(element);
      // might be clickable
      if (["pointer", "zoom-in", "zoom-out"].includes(style.cursor)) {
        mightBeClickable = true;
        isClickableElement = true;
      } else if (isScrollable(element, style)) {
        isClickableElement = true;
      }
    }

    if (!isClickableElement) continue;

    const rects = self.detector.get(element, viewport);
    if (rects.length === 0) continue;

    targets.push({ element, rects, mightBeClickable, style });
  }
  const elapsedMsec = performance.now() - startMsec;

  console.debug("list all elements: elapsedMsec=", elapsedMsec,
                "totalElements=", totalElements,
                "targetElements=", targets.length);

  return targets;
}

function distinctSimilarTarget(self, targets, viewport): Target[] {
  const targetMap: Map<Element, Target> = new Map((function* () {
    for (const t of targets) yield [t.element, t];
  })());

  function isVisibleNode(node) {
    // filter out blank text nodes
    if (node instanceof Text) return !(/^\s*$/).test(node.textContent);
    // filter out invisible element.
    if (node instanceof HTMLElement) {
      if (self.detector.get(node, viewport).length >= 1) return true;
      return false;
    }
    return true;
  }

  function removeFilteredOutElements() {
    for (const [ element, target ] of targetMap.entries()) {
      if (target.filteredOutBy) targetMap.delete(element);
    }
  }

  let mightBeClickables = targets.filter((t) => t.mightBeClickable);

  // Filter out targets which are children of <a> or <button>
  for (let i = 0; i < mightBeClickables.length; i++) {
    const target = mightBeClickables[i];

    const parentTarget = first(flatMap(traverseParent(target.element), (p) => {
      const t = targetMap.get(p);
      if (t == null) return [];
      if (t.filteredOutBy) return [t.filteredOutBy];
      if (["A", "BUTTON"].includes(t.element.tagName)) return [t];
      return [];
    }));
    if (parentTarget) {
      target.filteredOutBy = parentTarget;
      // console.debug("filter out: a child of a parent <a>/<button>: target=%o", target.element);
    }
  }

  mightBeClickables = mightBeClickables.filter((t) => !t.filteredOutBy);
  removeFilteredOutElements();

  // Filter out targets that is only one child for a parent that is target too.
  for (let i = 0; i < mightBeClickables.length; i++) {
    const target = mightBeClickables[i];
    if (target.filteredOutBy) continue;

    const thinAncestors = takeWhile(traverseParent(target.element), (e) => {
      return length(filter(e.childNodes, isVisibleNode)) === 1;
    });
    const parentTarget = first(flatMap(thinAncestors, (p) => {
      const t = targetMap.get(p);
      if (t == null) return [];
      if (t.filteredOutBy) return [t.filteredOutBy];
      return [t];
    }));
    if (parentTarget) {
      target.filteredOutBy = parentTarget;
      // console.debug("filter out: a child of a thin parent: target=%o", target.element);
    }
  }

  mightBeClickables = mightBeClickables.filter((t) => !t.filteredOutBy);
  removeFilteredOutElements();

  // Filter out targets that contains only existing targets
  for (let i = mightBeClickables.length - 1; i >= 0; i--) {
    const target = mightBeClickables[i];
    if (target.filteredOutBy) continue;

    const childNodes = Array.from(filter(target.element.childNodes, isVisibleNode));
    if (childNodes.every((c) => targetMap.has((c: any)))) {
      const child = childNodes[0];
      target.filteredOutBy = targetMap.get((child: any));
      // console.debug("filter out: only targets containing: target=%o", target.element);
    }
  }

  return targets.filter((t) => t.filteredOutBy == null);
}
