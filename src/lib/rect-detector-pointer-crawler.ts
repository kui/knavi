import { Cache } from "./cache";
import { Rect } from "./rects";

export class PointerCrawler {
  private readonly cache = new CoordinatesCache<Element | null>();
  constructor(private readonly intervalPx: number) {}

  *crawl(
    area: Rect<CoordinateType, "layout-viewport">,
  ): Generator<Element | null> {
    const minX = Math.ceil(area.x / this.intervalPx) * this.intervalPx;
    const maxX =
      Math.floor((area.x + area.width) / this.intervalPx) * this.intervalPx;
    const minY = Math.ceil(area.y / this.intervalPx) * this.intervalPx;
    const maxY =
      Math.floor((area.y + area.height) / this.intervalPx) * this.intervalPx;

    // TODO Randomize the order of crawling
    for (let x = minX; x < maxX; x += this.intervalPx) {
      for (let y = minY; y < maxY; y += this.intervalPx) {
        yield this.cache.getOr(x, y, () => this.point(x, y));
      }
    }
  }

  point(x: number, y: number): Element | null {
    let pointedElement = document.elementFromPoint(x, y);
    if (pointedElement == null) return null;

    // Traverse into shadow DOMs
    while (pointedElement.shadowRoot) {
      const elemementInShadow = pointedElement.shadowRoot.elementFromPoint(
        x,
        y,
      );
      if (elemementInShadow) {
        pointedElement = elemementInShadow;
      } else {
        return pointedElement;
      }
    }

    return pointedElement;
  }
}

class CoordinatesCache<E> {
  private readonly cache = new Cache<number, Cache<number, E>>();

  getOr(x: number, y: number, f: () => E): E {
    return this.cache.getOr(x, () => new Cache()).getOr(y, () => f());
  }
}
