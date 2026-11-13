import { Timers } from "../lib/metrics";
import { Rect } from "../dom/rects";

const MIN_POINT_SPACING_PX = 4;
const EDGE_INSET_PX = 1;

type HitTest = (x: number, y: number) => Element | null;

export class PointerCrawler {
  private timers = new Timers("PointerCrawler");

  constructor(private readonly hitTest: HitTest = elementFromPointComposed) {}

  *crawl(
    crawlArea: Rect<CoordinateType, "layout-viewport">,
  ): Generator<Element | null> {
    const alreadyCrawled = new Set<Element | null>();
    for (const [x, y] of samplePoints(crawlArea)) {
      const stop = this.timers.start("elementFromPoint");
      const e = this.hitTest(x, y);
      stop();
      if (alreadyCrawled.has(e)) continue;
      alreadyCrawled.add(e);
      yield e;
    }
  }

  printMetrics() {
    this.timers.print();
  }
}

/**
 * Yield the centre of the rect, then a grid that reaches to just inside each
 * edge, nearest to the centre first. Points along the edges let an element
 * that is visible only in a thin strip still be hit, and corners come last
 * because rounded corners and neighbours overlapping the edge miss there most.
 */
function* samplePoints({
  x,
  y,
  width,
  height,
}: Rect<CoordinateType, "layout-viewport">): Generator<[number, number]> {
  const cx = x + width / 2;
  const cy = y + height / 2;
  yield [cx, cy];
  const xs = axisPoints(x, width);
  const ys = axisPoints(y, height);
  const grid = xs.flatMap((px) => ys.map((py): [number, number] => [px, py]));
  const distance = ([px, py]: [number, number]) => Math.hypot(px - cx, py - cy);
  yield* grid.sort((a, b) => distance(a) - distance(b));
}

/**
 * Evenly spaced points from just inside the start to just inside the end.
 * INVARIANT: the count is even, so no point falls on the centre, which
 * samplePoints() tests first.
 */
function axisPoints(start: number, length: number): number[] {
  const inset = Math.min(EDGE_INSET_PX, length / 4);
  const span = length - 2 * inset;
  const count = span / 3 >= MIN_POINT_SPACING_PX ? 4 : 2;
  return Array.from(
    { length: count },
    (_, i) => start + inset + (span * i) / (count - 1),
  );
}

function elementFromPointComposed(x: number, y: number): Element | null {
  let pointedElement = document.elementFromPoint(x, y);
  if (pointedElement == null) return null;

  const stack = [pointedElement];
  while (pointedElement.shadowRoot) {
    const elemementInShadow = pointedElement.shadowRoot.elementFromPoint(x, y);
    if (elemementInShadow && !stack.includes(elemementInShadow)) {
      stack.push(elemementInShadow);
      pointedElement = elemementInShadow;
    } else {
      return pointedElement;
    }
  }

  return pointedElement;
}
