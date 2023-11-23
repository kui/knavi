import { filter, first, flatMap } from "./iters";
import { intersection, getBoundingRect, offsets } from "./rects";
import Cache from "./cache";
import CachedFetcher from "./cached-fetcher";
import { traverseParent } from "./elements";

export default class VisibleRectDetector {
  private readonly cache: Cache<Element, Rect[]>;
  private readonly clientRectsFetcher: CachedFetcher<Element, DOMRect[]>;
  private readonly styleFetcher: CachedFetcher<Element, CSSStyleDeclaration>;

  constructor(
    clientRectsFetcher: CachedFetcher<Element, DOMRect[]>,
    style: CachedFetcher<Element, CSSStyleDeclaration>,
  ) {
    this.cache = new Cache();
    this.clientRectsFetcher = clientRectsFetcher;
    this.styleFetcher = style;
  }

  // Return visible rects of the element.
  // Note: The rects are relative to "visual viewport".
  get(element: Element, visualVpFromLayoutVp: Rect): Rect[] {
    return this.cache.getOr(element, (e) => {
      return this.getVisibleRects(e, visualVpFromLayoutVp).map((r) =>
        offsets(r, visualVpFromLayoutVp),
      );
    });
  }

  private getVisibleRects(element: Element, visualVpFromLayoutVp: Rect) {
    const clientRects = this.getClientRects(element);
    return Array.from(
      flatMap(clientRects, (rect) => {
        // too small rects
        if (isSmallRect(rect)) return [];

        // out of display
        let croppedRect = intersection(rect, visualVpFromLayoutVp);
        if (!croppedRect || isSmallRect(croppedRect)) return [];

        // scroll out from parent element.
        croppedRect = this.cropByParent(
          element,
          croppedRect,
          visualVpFromLayoutVp,
        );
        if (!croppedRect || isSmallRect(croppedRect)) return [];

        // hidden by other element
        if (!this.isPointable(element, croppedRect, visualVpFromLayoutVp))
          return [];

        return [croppedRect];
      }),
    );
  }

  private getClientRects(element: Element): Rect[] {
    if (element instanceof HTMLAreaElement) return getAreaRects(element);
    if (element instanceof HTMLAnchorElement)
      return this.getAnchorRects(element);
    return this.clientRectsFetcher.get(element);
  }

  // Return a element client rect if the anchor contains only it.
  // TODO we should use a better way to detect anchor rect.
  private getAnchorRects(anchor: HTMLAnchorElement): Rect[] {
    const anchorRects = this.clientRectsFetcher.get(anchor);
    if (anchorRects.length === 0) return [];

    const childNodes = Array.from(
      filter(
        anchor.childNodes,
        (n) => !isBlankTextNode(n) && !this.isSmallElement(n),
      ),
    );
    if (childNodes.length !== 1) return anchorRects;

    const child = childNodes[0];
    if (!(child instanceof Element)) return anchorRects;

    const childRects = this.clientRectsFetcher.get(child);
    if (childRects.length === 0) return anchorRects;
    const childBoundingRect = getBoundingRect(childRects);
    if (isOverwrappedRect(childBoundingRect, anchorRects[0]))
      return anchorRects;

    const childStyle = this.styleFetcher.get(child);
    if (childStyle.float !== "none") return childRects;

    const anchorStyle = this.styleFetcher.get(anchor);
    if (anchorStyle.display !== "inline") return anchorRects;

    return childRects;
  }

  private isSmallElement(n: Node) {
    if (n instanceof Element) {
      const r = this.clientRectsFetcher.get(n);
      return r.length === 0 || r.every(isSmallRect);
    }
    return false;
  }

  private cropByParent(
    element: Element,
    rect: Rect,
    visualViewportFromLayoutVp: Rect,
  ): Rect | null {
    if (element === document.body) return rect;

    const parent = element.parentElement;
    if (!(parent instanceof Element) || parent === document.body) return rect;

    const elementPosition = this.styleFetcher.get(element).position;
    const parentOverflow = this.styleFetcher.get(parent).overflow;
    if (elementPosition === "fixed") return rect;
    if (
      elementPosition === "absolute" ||
      elementPosition === "sticky" ||
      parentOverflow === "visible"
    )
      return this.cropByParent(parent, rect, visualViewportFromLayoutVp);

    const parentRects = this.get(parent, visualViewportFromLayoutVp);
    if (parentRects.length === 0) return null;
    const cropped = intersection(rect, parentRects[0]);
    if (!cropped || isSmallRect(cropped)) return null;
    return this.cropByParent(parent, cropped, visualViewportFromLayoutVp);
  }

  // Return true if the target element is pointable from the visual viewport.
  private isPointable(target: Element, rect: Rect, visualVpFromLayoutVp: Rect) {
    const centerPoint = getPointByRectRatio(rect, 0.5, 0.5);
    const centerPointedElement = elementFromPoint(centerPoint);
    if (centerPointedElement) {
      if (
        target === centerPointedElement ||
        target.contains(centerPointedElement)
      )
        return true;

      // Return false if the pointed elements hide the target element.
      const pointedRects = this.get(centerPointedElement, visualVpFromLayoutVp);
      for (const pointedRect of pointedRects) {
        if (isOverwrappedRect(rect, pointedRect)) return false;
      }
    }

    for (const [xr, yr] of [
      [0.1, 0.1],
      [0.1, 0.9],
      [0.9, 0.1],
      [0.9, 0.9],
    ]) {
      const point = getPointByRectRatio(rect, xr, yr);
      if (!containPoint(point, visualVpFromLayoutVp)) continue;
      const pointedElement = elementFromPoint(point);
      if (!pointedElement) continue;
      if (target === pointedElement || target.contains(pointedElement))
        return true;
    }
    return false;
  }
}

const SMALL_THREASHOLD_PX = 3;
function isSmallRect({ width, height }: Sizes) {
  return height <= SMALL_THREASHOLD_PX || width <= SMALL_THREASHOLD_PX;
}

function getAreaRects(element: HTMLAreaElement): Rect[] {
  const map = first(
    filter(traverseParent(element), (e) => e.tagName === "MAP"),
  );
  if (!(map instanceof HTMLMapElement)) return [];

  const img = document.querySelector(`body /deep/ img[usemap="#${map.name}"]`);
  if (!img) return [];

  const rect = img.getBoundingClientRect();

  if (element.shape === "default") return [rect];

  const coords = element.coords.split(",").map((c) => parseInt(c));
  if (coords.some((c) => !(c >= 0))) {
    console.warn("Invalid coords", element);
    return [];
  }

  if (element.shape === "circle") {
    // return a square that be inscribed in the circle
    const [x, y, r] = coords;
    const d = r / Math.sqrt(2);
    return [
      {
        x: x - d + rect.left,
        y: y - d + rect.top,
        width: 2 * d,
        height: 2 * d,
      },
    ];
  }
  if (element.shape === "rect") {
    const [x1, y1, x2, y2] = coords;
    return [
      {
        x: x1 + rect.left,
        y: y1 + rect.top,
        width: x2 - x1,
        height: y2 - y1,
      },
    ];
  }
  if (element.shape === "poly") {
    // return a rectangle that contains all points
    // We should use a convex hull algorithm to get a better rectangle.
    const xs = coords.filter((_, i) => i % 2 === 0);
    const ys = coords.filter((_, i) => i % 2 === 1);
    const top = Math.min(...ys) + rect.top;
    const bottom = Math.max(...ys) + rect.top;
    const left = Math.min(...xs) + rect.left;
    const right = Math.max(...xs) + rect.left;
    return [
      {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      },
    ];
  }

  console.warn("Unknown shape", element);
  return [];
}

function isBlankTextNode(n: Node) {
  return n instanceof Text && /^\s*$/.test(n.data);
}

function elementFromPoint({ x, y }: Coordinates) {
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

function containPoint(point: Coordinates, rect: Rect) {
  return (
    rect.x <= point.x &&
    point.x <= rect.x + rect.width &&
    rect.y <= point.y &&
    point.y <= rect.y + rect.height
  );
}

// return true if `wrapper` COMPLETELY overwrap `target`
function isOverwrappedRect(target: Rect, wrapper: Rect) {
  const targetDomRect = DOMRectReadOnly.fromRect(target);
  const wrapperDomRect = DOMRectReadOnly.fromRect(wrapper);
  return (
    targetDomRect.left >= wrapperDomRect.left &&
    targetDomRect.right <= wrapperDomRect.right &&
    targetDomRect.top >= wrapperDomRect.top &&
    targetDomRect.bottom <= wrapperDomRect.bottom
  );
}

function getPointByRectRatio(rect: Rect, ratioX: number, ratioY: number) {
  return {
    x: rect.x + rect.width * ratioX,
    y: rect.y + rect.height * ratioY,
  };
}
