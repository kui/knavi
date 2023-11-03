import { filter, first, traverseParent, flatMap } from "./iters.js";
import { intersection, getBoundingRect } from "./rects.js";
import Cache from "./cache.js";

export default class VisibleRectDetector {
  constructor(caches) {
    this.cache = new Cache();
    this.clientRectsCache = caches.clientRects;
    this.styleCache = caches.style;
  }

  get(element, visualViewportFromLayoutVp) {
    return this.cache.getOr(element, () => {
      return getVisibleRects(this, element, visualViewportFromLayoutVp).map(r =>
        getRectFromVisualViewport(r, visualViewportFromLayoutVp)
      );
    });
  }
}

function getVisibleRects(self, element, viewport) {
  const clientRects = getClientRects(self, element);
  return Array.from(
    flatMap(clientRects, rect => {
      // too small rects
      if (isSmallRect(rect)) return [];

      // out of display
      let croppedRect = intersection(rect, viewport);
      if (!croppedRect || isSmallRect(croppedRect)) return [];

      // scroll out from parent element.
      croppedRect = cropByParent(self, element, croppedRect, viewport);
      if (!croppedRect || isSmallRect(croppedRect)) return [];

      // no overwrapped by other elements
      if (!isPointable(self, element, croppedRect, viewport)) return [];

      return [croppedRect];
    })
  );
}

const SMALL_THREASHOLD_PX = 3;
function isSmallRect({ width, height }) {
  return height <= SMALL_THREASHOLD_PX || width <= SMALL_THREASHOLD_PX;
}

function getClientRects(self, element) {
  switch (element.tagName) {
    case "AREA":
      return getAreaRects(element);
    case "A":
      return getAnchorRects(self, element);
    default:
      return self.clientRectsCache.get(element);
  }
}

function getAreaRects(element) {
  const map = first(filter(traverseParent(element), e => e.tagName === "MAP"));
  if (!(map instanceof HTMLMapElement)) return [];

  const img = document.querySelector(`body /deep/ img[usemap="#${map.name}"]`);
  if (!img) return [];

  const rect = img.getBoundingClientRect();

  if (element.shape === "default") return [rect];

  const coords = element.coords.split(",").map(c => parseInt(c));
  // filter out NaN
  if (coords.some(c => !(c >= 0))) return [];

  if (element.shape === "circle") {
    const [x, y, r] = coords;
    const d = r / Math.sqrt(2);
    const left = x - d + rect.left;
    const right = x + d + rect.left;
    const top = y - d + rect.top;
    const bottom = y + d + rect.top;
    return [
      { left, right, top, bottom, width: right - left, height: bottom - top }
    ];
  }

  // TODO poly support
  const [x1, y1, x2, y2] = coords;
  const top = Math.min(y1, y2) + rect.top;
  const bottom = Math.max(y1, y2) + rect.top;
  const left = Math.min(x1, x2) + rect.left;
  const right = Math.max(x1, x2) + rect.left;
  return [
    { left, right, top, bottom, width: right - left, height: bottom - top }
  ];
}

/// Return a element client rect if the anchor contains only it.
function getAnchorRects(self, anchor) {
  const anchorRects = self.clientRectsCache.get(anchor);
  if (anchorRects.length === 0) return [];

  const childNodes = Array.from(
    filter(
      anchor.childNodes,
      n => !isBlankTextNode(n) && !isSmallElement(self, n)
    )
  );
  if (childNodes.length !== 1) return anchorRects;

  const child = childNodes[0];
  if (!(child instanceof Element)) return anchorRects;

  const childRects = self.clientRectsCache.get(child);
  if (childRects.length === 0) return anchorRects;
  const childBoundingRect = getBoundingRect(childRects);
  if (isOverwrappedRect(childBoundingRect, anchorRects[0])) return anchorRects;

  const childStyle = self.styleCache.get(child);
  if (childStyle.float !== "none") return childRects;

  const anchorStyle = self.styleCache.get(anchor);
  const anchorDisplay = anchorStyle.display;
  if (anchorDisplay !== "inline") return anchorRects;

  return childRects;
}

function isBlankTextNode(n) {
  return n instanceof Text && /^\s*$/.test(n.textContent);
}

function isSmallElement(self, n) {
  if (n instanceof Element) {
    const r = self.clientRectsCache.get(n);
    return r.length === 0 || r.every(isSmallRect);
  }
  return false;
}

function isPointable(self, element, rect, viewport) {
  const { top, bottom, left, right } = rect;

  const x = avg(left, right, 0.5);
  const y = avg(top, bottom, 0.5);
  const pointedElement = deepElementFromPoint(x, y);
  if (pointedElement) {
    if (element === pointedElement || element.contains(pointedElement))
      return true;
    const pointedRects = self.get(pointedElement, viewport);
    for (const pointedRect of pointedRects) {
      if (isOverwrappedRect(rect, pointedRect)) return false;
    }
  }

  for (const [xr, yr] of [
    [0.1, 0.1],
    [0.1, 0.9],
    [0.9, 0.1],
    [0.9, 0.9]
  ]) {
    const x = avg(left, right, xr);
    const y = avg(top, bottom, yr);

    if (!isPointInRect(x, y, viewport)) continue;

    const pointedElement = deepElementFromPoint(x, y);
    if (pointedElement == null) continue;
    if (element === pointedElement || element.contains(pointedElement))
      return true;
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
  return rect.top <= y && y <= rect.bottom && rect.left <= x && x <= rect.right;
}

/// return true if `wrapper` COMPLETELY overwrap `target`
function isOverwrappedRect(target, wrapper) {
  return (
    target.top >= wrapper.top &&
    target.bottom <= wrapper.bottom &&
    target.left >= wrapper.left &&
    target.right <= target.right
  );
}

function cropByParent(self, element, rect, viewport) {
  if (element === document.body) return rect;

  const parent = element.parentElement;
  if (!(parent instanceof Element) || parent === document.body) return rect;

  const elementPosition = self.styleCache.get(element).position;
  const parentOverflow = self.styleCache.get(parent).overflow;
  if (elementPosition === "fixed") return rect;
  if (
    elementPosition === "absolute" ||
    elementPosition === "sticky" ||
    parentOverflow === "visible"
  )
    return cropByParent(self, parent, rect, viewport);

  const parentRects = self.get(parent, viewport);
  if (parentRects.length === 0) return null;
  const cropped = intersection(rect, parentRects[0]);
  if (!cropped || isSmallRect(cropped)) return null;
  return cropByParent(self, parent, cropped, viewport);
}

function avg(a, b, ratio) {
  return a * ratio + b * (1 - ratio);
}

function getRectFromVisualViewport(r, visualViewport) {
  return {
    top: r.top - visualViewport.top,
    bottom: r.bottom - visualViewport.top,
    left: r.left - visualViewport.left,
    right: r.right - visualViewport.left,
    width: r.width,
    height: r.height
  };
}
