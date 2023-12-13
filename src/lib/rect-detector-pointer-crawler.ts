import { Timers } from "./metrics";
import { Rect } from "./rects";

interface Area {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const GRID_POINTS = 4;

export class PointerCrawler {
  private timers = new Timers("PointerCrawler");

  constructor(private readonly stepPx: number) {}

  *crawl(
    crawlArea: Rect<CoordinateType, "layout-viewport">,
  ): Generator<Element | null> {
    const alreadyCrawled = new Set<Element | null>();
    const step = this.stepPx;
    const actualArea = {
      minX: Math.ceil(crawlArea.x / step) * step,
      maxX: Math.floor((crawlArea.x + crawlArea.width) / step) * step,
      minY: Math.ceil(crawlArea.y / step) * step,
      maxY: Math.floor((crawlArea.y + crawlArea.height) / step) * step,
    };
    for (const [x, y] of this.generateGridPoints(actualArea)) {
      const stop = this.timers.start("elementFromPoint");
      const e = this.elementFromPoint(x, y);
      stop();
      if (alreadyCrawled.has(e)) continue;
      alreadyCrawled.add(e);
      yield e;
    }
  }

  private *generatePoints(a: Area): Generator<[number, number]> {
    // Naive implementation
    for (let x = a.minX; x < a.maxX; x += this.stepPx) {
      for (let y = a.minY; y < a.maxY; y += this.stepPx) {
        yield [x, y];
      }
    }
  }

  private *generateEdgesPoints(a: Area): Generator<[number, number]> {
    const step = this.stepPx;
    for (let x = a.minX; x < a.maxX; x += step) {
      yield [x, a.minY];
      yield [x, a.maxY];
    }
    for (let y = a.minY; y < a.maxY; y += step) {
      yield [a.minX, y];
      yield [a.maxX, y];
    }
  }

  private *generateDiagonalPoints(a: Area): Generator<[number, number]> {
    const step = this.stepPx;
    const shortEdge = Math.min(a.maxX - a.minX, a.maxY - a.minY);
    const maxDelta = shortEdge / 2;
    for (let delta = 0; delta < maxDelta; delta += step) {
      yield [a.minX + delta, a.minY + delta];
      yield [a.maxX - delta, a.minY + delta];
      yield [a.minX + delta, a.maxY - delta];
      yield [a.maxX - delta, a.maxY - delta];
    }
  }

  private *generateGridPoints(a: Area): Generator<[number, number]> {
    const step = this.stepPx;
    const xStep =
      Math.max(Math.floor((a.maxX - a.minX) / GRID_POINTS / step), 1) * step;
    const yStep =
      Math.max(Math.floor((a.maxY - a.minY) / GRID_POINTS / step), 1) * step;
    for (let x = a.minX; x < a.maxX; x += xStep)
      for (let y = a.minY; y < a.maxY; y += yStep) yield [x, y];
  }

  private elementFromPoint(x: number, y: number): Element | null {
    let pointedElement = document.elementFromPoint(x, y);
    if (pointedElement == null) return null;

    // Traverse into shadow DOMs
    const stack = [pointedElement];
    while (pointedElement.shadowRoot) {
      const elemementInShadow = pointedElement.shadowRoot.elementFromPoint(
        x,
        y,
      );
      if (elemementInShadow && !stack.includes(elemementInShadow)) {
        stack.push(elemementInShadow);
        pointedElement = elemementInShadow;
      } else {
        return pointedElement;
      }
    }

    return pointedElement;
  }

  printMetrics() {
    this.timers.print();
  }
}
