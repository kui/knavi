import { filter, first, flatMap } from "./iters";
import { Rect, Coordinates } from "./rects";
import Cache from "./cache";
import CachedFetcher from "./cached-fetcher";
import { getBoundingClientRect, traverseParent } from "./elements";

export default class VisibleRectDetector {
  private readonly cache: Cache<
    Element,
    Rect<"element-border", "actual-viewport">[]
  >;

  constructor(
    private readonly viewport: Rect<"actual-viewport", "layout-viewport">,
    private readonly clientRectsFetcher: CachedFetcher<
      Element,
      Rect<"element-border", "layout-viewport">[]
    >,
    private readonly styleFetcher: CachedFetcher<
      Element,
      StylePropertyMapReadOnly
    >,
  ) {
    this.cache = new Cache();
  }

  // Return visible rects of the element.
  get(element: Element): Rect<"element-border", "actual-viewport">[] {
    return this.cache.getOr(element, (e) => {
      return this.getVisibleRects(e).map((r) => r.offsets(this.viewport));
    });
  }

  private getVisibleRects(
    element: Element,
  ): Rect<"element-border", "layout-viewport">[] {
    const clientRects = this.getClientRects(element);
    return Array.from(
      flatMap(
        clientRects,
        (rect: Rect<"element-border", "layout-viewport">) => {
          // too small rects
          if (isSmallRect(rect)) return [];

          // out of display
          let croppedRect: Rect<"element-border", "layout-viewport"> | null =
            Rect.intersection("element-border", rect, this.viewport);
          if (!croppedRect || isSmallRect(croppedRect)) return [];

          console.log("cropByParent", element, croppedRect, this.viewport);
          // scroll out from parent element that has non-visible "overflow"
          croppedRect = this.cropByParent(element, croppedRect);
          if (!croppedRect || isSmallRect(croppedRect)) return [];

          // hidden by other element
          if (!this.isPointable(element, croppedRect)) return [];

          return [croppedRect];
        },
      ),
    );
  }

  private getClientRects(
    element: Element,
  ): Rect<"element-border", "layout-viewport">[] {
    if (element instanceof HTMLAreaElement) return getAreaRects(element);
    if (element instanceof HTMLAnchorElement)
      return this.getAnchorRects(element);
    return this.clientRectsFetcher.get(element);
  }

  // Return element client rects if the anchor contains only it.
  // TODO we should use a better way to detect anchor rect.
  private getAnchorRects(
    anchor: HTMLAnchorElement,
  ): Rect<"element-border", "layout-viewport">[] {
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
    const childBoundingRect = Rect.boundRects(...childRects);
    if (isOverwrappedRect(childBoundingRect, anchorRects[0]))
      return anchorRects;

    const childStyle = this.styleFetcher.get(child);
    if (childStyle.get("float")?.toString() !== "none") return childRects;

    const anchorStyle = this.styleFetcher.get(anchor);
    if (anchorStyle.get("display")?.toString() !== "inline") return anchorRects;

    return childRects;
  }

  private isSmallElement(n: Node) {
    if (n instanceof Element) {
      const r = this.clientRectsFetcher.get(n);
      return r.length === 0 || r.every(isSmallRect);
    }
    return false;
  }

  // TODO insufficient testing
  private cropByParent(
    element: Element,
    rect: Rect<"element-border", "layout-viewport">,
  ): Rect<"element-border", "layout-viewport"> | null {
    if (element === document.body) return rect;

    const parent = element.parentElement;
    if (!parent || parent === document.body) return rect;

    const parentOverflow = this.styleFetcher
      .get(parent)
      .get("overflow")!
      .toString();
    if (parentOverflow === "visible") return this.cropByParent(parent, rect);

    const elementPosition = this.styleFetcher
      .get(element)
      .get("position")!
      .toString();
    // TODO We need to support some case like "transform" property in ancestor.
    // See https://developer.mozilla.org/en-US/docs/Web/CSS/position#fixed_positioning
    if (elementPosition === "fixed") return rect;
    if (elementPosition === "absolute" || elementPosition === "sticky")
      return this.cropByParent(parent, rect);

    const parentRects = this.get(parent);
    if (parentRects.length === 0) return null;

    const cropped = Rect.intersectionWithSameType(
      rect,
      parentRects[0].offsets(this.viewport.reverse()),
    );
    if (!cropped || isSmallRect(cropped)) return null;

    return this.cropByParent(parent, cropped);
  }

  // Return true if the target element is pointable from the visual viewport.
  private isPointable(
    target: Element,
    rect: Rect<"element-border", "layout-viewport">,
  ) {
    const centerPoint = getPointByRectRatio(rect, 0.5, 0.5);
    const centerPointedElement = elementFromPoint(centerPoint);
    if (centerPointedElement) {
      if (
        target === centerPointedElement ||
        target.contains(centerPointedElement)
      )
        return true;

      // Return false if the pointed elements hide the target element.
      const pointedRects = this.get(centerPointedElement);
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
      if (!containPoint(point, this.viewport)) continue;
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

function getAreaRects(
  element: HTMLAreaElement,
): Rect<"element-border", "layout-viewport">[] {
  const map = first(
    filter(traverseParent(element), (e) => e.tagName === "MAP"),
  );
  if (!(map instanceof HTMLMapElement)) return [];

  const img = document.querySelector(`body /deep/ img[usemap="#${map.name}"]`);
  if (!img) return [];

  // TODO: imgRect should be the content area of the img element.
  // But we can't get the content area rect from the client rects.
  // So we use the border area as a workaround.
  // See also: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Introduction_to_the_CSS_box_model#content_area
  const imgRect = getBoundingClientRect(img);

  if (element.shape === "default") return [imgRect];

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
        x: x - d + imgRect.x,
        y: y - d + imgRect.y,
        width: 2 * d,
        height: 2 * d,
      } as Rect<"element-border", "layout-viewport">,
    ];
  }
  if (element.shape === "rect") {
    const [x1, y1, x2, y2] = coords;
    return [
      {
        x: x1 + imgRect.x,
        y: y1 + imgRect.y,
        width: x2 - x1,
        height: y2 - y1,
      } as Rect<"element-border", "layout-viewport">,
    ];
  }
  if (element.shape === "poly") {
    // return a rectangle that contains all points
    // We should use a convex hull algorithm to get a better rectangle.
    const xs = coords.filter((_, i) => i % 2 === 0);
    const ys = coords.filter((_, i) => i % 2 === 1);
    const top = Math.min(...ys) + imgRect.y;
    const bottom = Math.max(...ys) + imgRect.y;
    const left = Math.min(...xs) + imgRect.x;
    const right = Math.max(...xs) + imgRect.x;
    return [
      {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      } as Rect<"element-border", "layout-viewport">,
    ];
  }

  console.warn("Unknown shape", element);
  return [];
}

function isBlankTextNode(n: Node) {
  return n instanceof Text && /^\s*$/.test(n.data);
}

function elementFromPoint({ x, y }: Coordinates<"point", "layout-viewport">) {
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

function containPoint<Origin extends CoordinateType>(
  point: Coordinates<CoordinateType, Origin>,
  rect: Rect<CoordinateType, Origin>,
): boolean {
  return (
    rect.x <= point.x &&
    point.x <= rect.x + rect.width &&
    rect.y <= point.y &&
    point.y <= rect.y + rect.height
  );
}

// return true if `wrapper` COMPLETELY overwrap `target`
function isOverwrappedRect<Origin extends CoordinateType>(
  target: Rect<CoordinateType, Origin>,
  wrapper: Rect<CoordinateType, Origin>,
): boolean {
  const targetDomRect = DOMRectReadOnly.fromRect(target);
  const wrapperDomRect = DOMRectReadOnly.fromRect(wrapper);
  return (
    targetDomRect.left >= wrapperDomRect.left &&
    targetDomRect.right <= wrapperDomRect.right &&
    targetDomRect.top >= wrapperDomRect.top &&
    targetDomRect.bottom <= wrapperDomRect.bottom
  );
}

function getPointByRectRatio(
  rect: Rect<"element-border", "layout-viewport">,
  ratioX: number,
  ratioY: number,
): Coordinates<"point", "layout-viewport"> {
  return new Coordinates({
    type: "point",
    origin: "layout-viewport",
    x: rect.x + rect.width * ratioX,
    y: rect.y + rect.height * ratioY,
  });
}
