import { Timers } from "../lib/metrics";
import { Rect } from "../dom/rects";

const GRID_POINTS = 4;

type HitTest = (x: number, y: number) => Element | null;

export class PointerCrawler {
  private timers = new Timers("PointerCrawler");

  constructor(
    private readonly stepPx: number,
    private readonly hitTest: HitTest = elementFromPointComposed,
  ) {}

  *crawl(
    crawlArea: Rect<CoordinateType, "layout-viewport">,
  ): Generator<Element | null> {
    const alreadyCrawled = new Set<Element | null>();
    for (const [x, y] of samplePoints(crawlArea, this.stepPx)) {
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
 * Yield the centre of the rect first, then the centres of an evenly spaced
 * grid of up to GRID_POINTS x GRID_POINTS cells, so that every rect wider and
 * taller than zero gets at least one point strictly inside it.
 */
function* samplePoints(
  { x, y, width, height }: Rect<CoordinateType, "layout-viewport">,
  stepPx: number,
): Generator<[number, number]> {
  yield [x + width / 2, y + height / 2];
  const cols = cellCount(width, stepPx);
  const rows = cellCount(height, stepPx);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      // WHY: with an odd number of cells on both axes, the middle cell's centre is the rect's centre, already tested first.
      if (2 * i + 1 === cols && 2 * j + 1 === rows) continue;
      yield [x + (width * (i + 0.5)) / cols, y + (height * (j + 0.5)) / rows];
    }
}

function cellCount(length: number, stepPx: number): number {
  return Math.min(Math.max(Math.floor(length / stepPx), 1), GRID_POINTS);
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
