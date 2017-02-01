// @flow

import { flatMap, traverseParent, filter, first, takeWhile, length } from "./iters";
import { isScrollable } from "./utils";
import VisibleRectDetector from "./visible-rect-detector";

import type { Rect } from "./rect-fetcher-client";

export default class RectFetcher {
  detector: VisibleRectDetector;
  additionalSelectors: string[];

  constructor(additionalSelectors: string[]) {
    this.detector = new VisibleRectDetector;
    this.additionalSelectors = additionalSelectors;
  }

  getAll(): { element: HTMLElement, rects: Rect[] }[] {
    const t = listAllTarget(this.detector, this.additionalSelectors);
    return distinctSimilarTarget(this.detector, t);
  }
}

declare interface Target {
  element: HTMLElement;
  rects: Rect[];
  mightBeClickable?: boolean;
  filteredOutBy?: ?Target;
  style?: ?CSSStyleDeclaration;
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

function listAllTarget(rectsDetector: VisibleRectDetector, additionalSelectors: string[]): Target[] {
  const selecteds = new Set(document.querySelectorAll(HINTABLE_QUERY));
  if (additionalSelectors.length >= 1) {
    const q = additionalSelectors.map((s) => "body /deep/ " + s).join(",");
    for (const e of document.querySelectorAll(q)) selecteds.add(e);
  }

  const targets: Target[] = [];

  if (document.activeElement !== document.body) {
    const rects = rectsDetector.get(document.body);
    targets.push({ element: document.body, rects });
  }

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
      style = window.getComputedStyle(element);
      // might be clickable
      if (["pointer", "zoom-in", "zoom-out"].includes(style.cursor)) {
        mightBeClickable = true;
        isClickableElement = true;
      } else if (isScrollable(element, style)) {
        isClickableElement = true;
      }
    }

    if (!isClickableElement) continue;

    const rects = rectsDetector.get(element);
    if (rects.length === 0) continue;

    targets.push({ element, rects, mightBeClickable, style });
  }
  const elapsedMsec = performance.now() - startMsec;

  console.debug("list all elements: elapsedMsec=", elapsedMsec,
                "totalElements=", totalElements,
                "targetElements=", targets.length);

  return targets;
}

function distinctSimilarTarget(rectsDetector: VisibleRectDetector, targets: Target[]): Target[] {
  const targetMap: Map<Element, Target> = new Map((function* () {
    for (const t of targets) yield [t.element, t];
  })());

  function isVisibleNode(node) {
    // filter out blank text nodes
    if (node instanceof Text) return !(/^\s*$/).test(node.textContent);
    // filter out invisible element.
    if (node instanceof HTMLElement) {
      if (rectsDetector.get(node).length >= 1) return true;
      return false;
    }
    return true;
  }

  // Filter out if this target is a child of <a> or <button>
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target.mightBeClickable) continue;

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

  // Filter out targets that is only one child for a parent target element.
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target.mightBeClickable) continue;
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

  // Filter out targets that contains only existing targets
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    if (!target.mightBeClickable) continue;
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
