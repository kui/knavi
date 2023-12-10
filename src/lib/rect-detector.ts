import { CachedFetcher, AsyncCache } from "./cache";
import { getBoundingClientRect, traverseParent } from "./elements";
import { asyncFlatMap, filter, first, toAsyncArray } from "./iters";
import { PointerCrawler } from "./rect-detector-pointer-crawler";
import { Rect } from "./rects";

interface ElementRect {
  rect: Rect<"element-border", "layout-viewport">;
  // Phantom rect is not originally in the DOM tree.
  // For example, the clickable area of <area> is not in the DOM tree.
  // phantom rect should be skipped that is pointable by pointer.
  isPhantom?: boolean;
}

const SCAN_STEP_PX = 4;

export class RectDetector {
  private readonly cache = new AsyncCache<
    Element,
    Rect<"element-border", "actual-viewport">[]
  >(3000);
  private readonly pointerCrawler = new PointerCrawler(SCAN_STEP_PX);

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
  ) {}

  async detect(e: Element) {
    return this.cache.getOr(e, (e) => this.detectVisibles(e));
  }

  private async detectVisibles(
    element: Element,
  ): Promise<Rect<"element-border", "actual-viewport">[]> {
    if (
      !element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      })
    )
      return [];

    return toAsyncArray(
      asyncFlatMap(
        this.getClientRects(element),
        async ({
          rect,
          isPhantom,
        }): Promise<Rect<"element-border", "actual-viewport">[]> => {
          // Too small
          if (isSmallRect(rect)) return [];

          // out of viewport
          let croppedRect: Rect<"element-border", "layout-viewport"> | null =
            Rect.intersection("element-border", rect, this.viewport);
          if (!croppedRect || isSmallRect(croppedRect)) return [];

          // hidden by parent element overflow
          croppedRect = await this.cropByParent(element, croppedRect);
          if (!croppedRect || isSmallRect(croppedRect)) return [];

          // pointer can't reach to the element
          if (!isPhantom && !this.isPointable(element, croppedRect)) return [];

          return [croppedRect.offsets(this.viewport)];
        },
      ),
    );
  }

  private getClientRects(element: Element): ElementRect[] {
    if (element instanceof HTMLAreaElement) {
      return getAreaRects(element).map((rect) => ({ rect, isPhantom: true }));
    }
    return this.clientRectsFetcher.get(element).map((rect) => ({ rect }));
  }

  private async cropByParent(
    element: Element,
    rect: Rect<"element-border", "layout-viewport">,
  ): Promise<Rect<"element-border", "layout-viewport"> | null> {
    if (element === document.body || element === document.documentElement)
      return rect;

    const elementPosition = this.styleFetcher
      .get(element)
      .get("position")!
      .toString();
    // TODO We need to support some case like "transform" property in ancestor.
    // See https://developer.mozilla.org/en-US/docs/Web/CSS/position#fixed_positioning
    if (elementPosition === "fixed") return rect;

    const parent = element.parentElement;
    if (!parent) {
      console.warn("No parent element", element);
      return null;
    }

    const parentOverflow = this.styleFetcher
      .get(parent)
      .get("overflow")!
      .toString();
    if (parentOverflow === "visible") return this.cropByParent(parent, rect);

    const [parentRect] = await this.detect(parent);
    if (!parentRect) return null;

    const cropped = Rect.intersectionWithSameType(
      rect,
      parentRect.offsets(this.viewport.reverse()),
    );
    if (!cropped || isSmallRect(cropped)) return null;

    return this.cropByParent(parent, cropped);
  }

  private isPointable(
    element: Element,
    rect: Rect<"element-border", "layout-viewport">,
  ) {
    for (const e of this.pointerCrawler.crawl(rect))
      if (e && element.contains(e)) return true;
    return false;
  }
}

function isSmallRect({ width, height }: Sizes) {
  return width <= SCAN_STEP_PX || height <= SCAN_STEP_PX;
}

function getAreaRects(
  element: HTMLAreaElement,
): Rect<"element-border", "layout-viewport">[] {
  const map = first(
    filter(traverseParent(element), (e) => e instanceof HTMLMapElement),
  );
  if (!(map instanceof HTMLMapElement)) return [];

  const img = document.querySelector(`body /deep/ img[usemap="#${map.name}"]`);
  if (!img) return [];

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
      new Rect({
        type: "element-border",
        origin: "layout-viewport",
        x: x - d + imgRect.x,
        y: y - d + imgRect.y,
        width: 2 * d,
        height: 2 * d,
      }),
    ];
  }
  if (element.shape === "rect") {
    const [x1, y1, x2, y2] = coords;
    return [
      new Rect({
        type: "element-border",
        origin: "layout-viewport",
        x: x1 + imgRect.x,
        y: y1 + imgRect.y,
        width: x2 - x1,
        height: y2 - y1,
      }),
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
      new Rect({
        type: "element-border",
        origin: "layout-viewport",
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      }),
    ];
  }

  console.warn("Unknown shape", element);
  return [imgRect];
}
