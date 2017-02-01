// @flow

import { filter, first, traverseParent, flatMap } from "./iters";
import { intersection } from "./rects";
import Cache from "./cache";

import type { Rect } from "./rects";

export default class VisibleRectDetector {
  cache: Cache<HTMLElement, Rect[]>;
  clientRectsCache: Cache<HTMLElement, ClientRect[]>;
  styleCache: Cache<HTMLElement, CSSStyleDeclaration>;

  constructor(styleCache: Cache<HTMLElement, CSSStyleDeclaration>) {
    this.cache = new Cache;
    this.clientRectsCache = new Cache((e) => e.getClientRects());
    this.styleCache = styleCache;
  }

  get(element: HTMLElement, visualViewportFromLayoutVp: Rect): Rect[] {
    return this.cache.getOr(element, () => {
      return getVisibleRects(this, element, visualViewportFromLayoutVp)
        .map((r) => getRectFromVisualViewport(r, visualViewportFromLayoutVp));
    });
  }
}

function getVisibleRects(self, element, viewport): Rect[] {
  const clientRects = getClientRects(self, element);
  return Array.from(flatMap(clientRects, (rect) => {
    // too small rects
    if (isSmallRect(rect)) return [];

    // out of display
    const croppedRect = intersection(rect, viewport);
    if (!croppedRect || isSmallRect(croppedRect)) return [];

    // no overwrapped by other elements
    if (!isPointable(self, element, rect, viewport)) return [];

    return [croppedRect];
  }));
}

const SMALL_THREASHOLD_PX = 3;
function isSmallRect({ width, height }: Rect) {
  return height <= SMALL_THREASHOLD_PX || width <= SMALL_THREASHOLD_PX;
}

function getClientRects(self: VisibleRectDetector, element: HTMLElement): Iterable<Rect> {
  switch (element.tagName) {
  case "AREA": return getAreaRects((element: any));
  case "A": return getAnchorRects(self, (element: any));
  default: return self.clientRectsCache.get(element);
  }
}

function getAreaRects(element: HTMLAreaElement): Rect[] {
  const map = first(filter(traverseParent(element), (e) => e.tagName === "MAP"));
  if (!(map instanceof HTMLMapElement)) return [];

  const img = document.querySelector(`body /deep/ img[usemap="#${map.name}"]`);
  if (!img) return [];

  const rect = img.getBoundingClientRect();

  if (element.shape === "default") return [rect];

  const coords = element.coords.split(",").map((c) => parseInt(c));
  // filter out NaN
  if (coords.some((c) => !(c >= 0))) return [];

  if (element.shape === "circle") {
    const [x, y, r] = coords;
    const d = r / Math.sqrt(2);
    const left  = x - d + rect.left;
    const right = x + d + rect.left;
    const top    = y - d + rect.top;
    const bottom = y + d + rect.top;
    return [{ left, right, top, bottom, width: right - left, height: bottom - top }];
  }

  // TODO poly support
  const [x1, y1, x2, y2] = coords;
  const top    = Math.min(y1, y2) + rect.top;
  const bottom = Math.max(y1, y2) + rect.top;
  const left   = Math.min(x1, x2) + rect.left;
  const right  = Math.max(x1, x2) + rect.left;
  return [{ left, right, top, bottom, width: right - left, height: bottom - top }];
}

/// Return a img element client rect if the anchor contains only it.
function getAnchorRects(self: VisibleRectDetector, anchor: HTMLAnchorElement): Iterable<Rect> {
  const anchorRects = self.clientRectsCache.get(anchor);

  const childNodes = Array.from(filter(anchor.childNodes, (n) => !isBlankTextNode(n)));
  if (childNodes.length !== 1) return anchorRects;

  const child = childNodes[0];
  if (!(child instanceof HTMLImageElement)) return anchorRects;

  const imgRects = self.clientRectsCache.get(child);
  if (isOverwrappedRect(imgRects[0], anchorRects[0])) return anchorRects;

  return imgRects;
}

function isBlankTextNode(n) {
  return (n instanceof Text) && (/^\s*$/).test(n.textContent);
}

function isPointable(self, element, rect, viewport): boolean {
  const { top, bottom, left, right } = rect;

  const x = avg(left, right, 0.5);
  const y = avg(top, bottom, 0.5);
  const pointedElement = deepElementFromPoint(x, y);
  if (pointedElement) {
    if (element === pointedElement || element.contains(pointedElement)) return true;
    const pointedRects = self.get(pointedElement, viewport);
    for (const pointedRect of pointedRects) {
      if (isOverwrappedRect(rect, pointedRect)) return false;
    }
  }

  for (const [xr, yr] of [[0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9]]) {
    const x = avg(left, right, xr);
    const y = avg(top, bottom, yr);

    if (!isPointInRect(x, y, viewport)) continue;

    const pointedElement = deepElementFromPoint(x, y);
    if (pointedElement == null) continue;
    if (element === pointedElement || element.contains(pointedElement)) return true;
  }
  return false;
}

function deepElementFromPoint(x, y) {
  let pointedElement = document.elementFromPoint(x, y);
  if (pointedElement == null) return null;

  // Traverse into shadow DOMs
  while (pointedElement.shadowRoot) {
    const elemementInShadow = pointedElement.shadowRoot.elementFromPoint(x, y);
    if (elemementInShadow) {
      pointedElement = elemementInShadow;
    } else {
      return pointedElement;
    }
  }

  return pointedElement;
}

function isPointInRect(x, y, rect) {
  return rect.top <= y && y <= rect.bottom
    && rect.left <= x && x <= rect.right;
}

/// return true if `wrapper` COMPLETELY overwrap `target`
function isOverwrappedRect(target: Rect, wrapper: Rect) {
  return target.top >= wrapper.top &&
    target.bottom <= wrapper.bottom &&
    target.left >= wrapper.left &&
    target.right <= target.right;
}

function avg(a: number, b: number, ratio: number): number {
  return a * ratio + b * (1 - ratio);
}

function getRectFromVisualViewport(r: Rect, visualViewport: Rect) {
  return {
    top: r.top - visualViewport.top,
    bottom: r.bottom - visualViewport.top,
    left: r.left - visualViewport.left,
    right: r.right - visualViewport.left,
    width: r.width,
    height: r.height,
  };
}
