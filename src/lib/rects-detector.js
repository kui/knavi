// @flow

import * as iters from "./iters";

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export default class RectsDetector {
  cachedY: number;
  cachedX: number;
  cache: Cache<HTMLElement, Rect[]>;

  constructor() {
    this.cache = new Cache();
  }

  get(element: HTMLElement): Rect[] {
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    if (this.cachedY !== scrollY || this.cachedX !== scrollX) {
      this.cache.clear();
      this.cachedY = scrollY;
      this.cachedX = scrollX;
    }

    return this.cache.get(element, () => {
      const clientRects = getClientRects(this, element);
      return cropVisibleRects(element, clientRects);
    });
  }

  getBoundingClientRect(element: HTMLElement): Rect {
    const rects = getClientRects(this,element);
    return buildBoundingRect(Array.from(rects));
  }
}

class Cache<K, V> {
  c: Map<K, V>;

  constructor() {
    this.clear();
  }

  get(key: K, fallback: () => V): V {
    const v = this.c.get(key);
    if (v) return v;

    const vv = fallback();
    this.c.set(key, vv);
    return vv;
  }

  clear() {
    this.c = new Map;
  }
}

function cropVisibleRects(element: HTMLElement, clientRects: Iterable<Rect>): Rect[] {
  const innerWidth = window.innerWidth;
  const innerHeight = window.innerHeight;
  return Array.from(iters.flatMap(clientRects, (rect) => {
    const { width, height, top, bottom, left, right } = rect;

    // too small rects
    if (width <= 3 && height <= 3) return [];

    // out of display
    if (bottom <= 3 && top >= innerHeight - 3 &&
        right <= 3  && left >= innerWidth - 3) return [];

    // is clickable element?
    // Actualy isVisible needs this check only.
    // However two former checks are faster than this.
    if (!isPointable(element, rect)) return [];

    const newTop = Math.max(top, 0);
    const newBottom = Math.min(bottom, innerHeight);
    const newLeft = Math.max(left, 0);
    const newRight = Math.min(right, innerWidth);
    return [{
      top: newTop, bottom: newBottom,
      left: newLeft, right: newRight,
      height: newBottom - newTop,
      width: newRight - newLeft,
    }];
  }));
}

function getClientRects(self: RectsDetector, element: HTMLElement): Iterable<Rect> {
  switch (element.tagName) {
  case "AREA": return getAreaRects((element: any));
  case "A": return getAnchorRects(self, (element: any));
  default: return element.getClientRects();
  }
}

function getAreaRects(element: HTMLAreaElement): Rect[] {
  const map = iters.first(iters.filter(iters.traverseParent(element), (e) => e.tagName === "MAP"));
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
function getAnchorRects(self: RectsDetector, element: HTMLAnchorElement): Iterable<Rect> {
  const childNodes = Array.from(iters.filter(element.childNodes, (n) => isVisibleNode(self, n)));
  if (childNodes.length !== 1) return element.getClientRects();
  const child = childNodes[0];
  return (child instanceof HTMLImageElement ? child : element).getClientRects();
}

function isVisibleNode(self: RectsDetector, node: Node): boolean {
  if (node instanceof Text) return !(/^\s*$/).test(node.textContent);
  if (node instanceof HTMLElement) {
    if (self.get(node).length >= 1) return true;
    return false;
  }
  // Unknown node type
  return true;
}

const RECT_POSITIONS = [[0.5, 0.5], [0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9]];

function isPointable(element: HTMLElement, rect: Rect): boolean {
  const { top, bottom, left, right } = rect;
  for (const [xr, yr] of RECT_POSITIONS) {
    const x = avg(left, right, xr);
    const y = avg(top,  bottom, yr);

    let pointedElem = document.elementFromPoint(x, y);
    if (pointedElem == null) continue;

    // Traverse into shadow DOMs
    while (pointedElem.shadowRoot) {
      const elemInShadow = pointedElem.shadowRoot.elementFromPoint(x, y);
      if (elemInShadow) {
        pointedElem = elemInShadow;
      } else {
        break;
      }
    }

    if (element === pointedElem || element.contains(pointedElem)) return true;
  }
  return false;
}

function buildBoundingRect(rects: Rect[]): Rect {
  const top    = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const left   = Math.min(...rects.map((r) => r.left));
  const right  = Math.min(...rects.map((r) => r.right));
  return { top, bottom, left, right, height: bottom - top, width: right - left };
}

function avg(a: number, b: number, ratio: number): number {
  return a * ratio + b * (1 - ratio);
}
