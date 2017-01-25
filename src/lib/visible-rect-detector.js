// @flow

import * as iters from "./iters";
import * as vp from "./viewports";

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export default class VisibleRectDetector {
  cache: Cache<HTMLElement, Rect[]>;
  visiualVpOffsets: { x: number, y: number };

  constructor() {
    this.cache = new Cache();
    this.visiualVpOffsets = getVisualVpOffsetsFromLayoutVp();
  }

  get(element: HTMLElement): Rect[] {
    return this.cache.get(element, () => {
      const clientRects = getClientRects(this, element);
      return filterVisibleRects(element, clientRects)
        .map((r) => getRectFromVisualViewport(r, this.visiualVpOffsets));
    });
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

function filterVisibleRects(element: HTMLElement, clientRects: Iterable<Rect>): Rect[] {
  const vpSizes = vp.layout.sizes();
  const viewportRect = {
    top: 0, bottom: vpSizes.height,
    left: 0, right: vpSizes.width,
    height: vpSizes.height, width: vpSizes.width,
  };
  return Array.from(iters.filter(clientRects, (rect) => {
    // too small rects
    if (isSmallRect(rect)) return false;

    // out of display
    const croppedRect = cropRect(rect, viewportRect, 3);
    if (isSmallRect(croppedRect)) return false;

    // is clickable element?
    // Actualy isVisible needs this check only.
    // However two former checks are faster than this.
    if (!isPointable(element, rect, viewportRect)) return false;

    return true;
  }));
}

function cropRect(target: Rect, cropper: Rect, padding?: number = 0): Rect {
  const top = Math.max(target.top, cropper.top + padding);
  const bottom = Math.min(target.bottom, cropper.bottom - padding);
  const left = Math.max(target.left, cropper.left + padding);
  const right = Math.min(target.right, cropper.right - padding);
  const height = bottom - top;
  const width = right - left;
  return { top, bottom, left, right, height, width };
}

const SMALL_THREASHOLD_PX = 3;
function isSmallRect({ width, height }: Rect) {
  return height <= SMALL_THREASHOLD_PX || width <= SMALL_THREASHOLD_PX;
}

function getClientRects(self: VisibleRectDetector, element: HTMLElement): Iterable<Rect> {
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
function getAnchorRects(self: VisibleRectDetector, element: HTMLAnchorElement): Iterable<Rect> {
  const childNodes = Array.from(iters.filter(element.childNodes, (n) => isVisibleNode(self, n)));
  if (childNodes.length !== 1) return element.getClientRects();
  const child = childNodes[0];
  return (child instanceof HTMLImageElement ? child : element).getClientRects();
}

function isVisibleNode(self: VisibleRectDetector, node: Node): boolean {
  if (node instanceof Text) return !(/^\s*$/).test(node.textContent);
  if (node instanceof HTMLElement) {
    if (self.get(node).length >= 1) return true;
    return false;
  }
  // Unknown node type
  return true;
}

const RECT_POSITIONS = [[0.5, 0.5], [0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9]];

function isPointable(element: HTMLElement, rect: Rect, viewportRect: Rect): boolean {
  const { top, bottom, left, right } = rect;
  for (const [xr, yr] of RECT_POSITIONS) {
    const x = avg(left, right, xr);
    const y = avg(top,  bottom, yr);

    if (!isPointInRect(x, y, viewportRect)) continue;

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

function isPointInRect(x, y, rect) {
  return rect.top <= y && y <= rect.bottom
    && rect.left <= x && x <= rect.right;
}

function avg(a: number, b: number, ratio: number): number {
  return a * ratio + b * (1 - ratio);
}

function getVisualVpOffsetsFromLayoutVp() {
  const layoutVpOffsets = vp.layout.offsets();
  const visualVpOffsets = vp.visual.offsets();
  return {
    x: visualVpOffsets.x - layoutVpOffsets.x,
    y: visualVpOffsets.y - layoutVpOffsets.y,
  };
}

function getRectFromVisualViewport(r: Rect, offsets: { x: number, y: number }) {
  return {
    top: r.top - offsets.y,
    bottom: r.bottom - offsets.y,
    left: r.left - offsets.x,
    right: r.right - offsets.x,
    width: r.width,
    height: r.height,
  };
}
