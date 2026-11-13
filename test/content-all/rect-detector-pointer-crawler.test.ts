import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PointerCrawler } from "../../src/content-all/rect-detector-pointer-crawler.js";
import { Rect } from "../../src/dom/rects.js";

const STEP_PX = 4;

function rect(x: number, y: number, width: number, height: number) {
  return new Rect({
    type: "element-border",
    origin: "layout-viewport",
    x,
    y,
    width,
    height,
  });
}

function sampledPoints(r: ReturnType<typeof rect>): [number, number][] {
  const points: [number, number][] = [];
  const crawler = new PointerCrawler(STEP_PX, (x, y) => {
    points.push([x, y]);
    return {} as Element;
  });
  void [...crawler.crawl(r)];
  return points;
}

void describe("PointerCrawler", () => {
  void test("samples a grid snapped to the step inside the rect", () => {
    const xs = [0, 8, 16, 24, 32];
    assert.deepEqual(
      sampledPoints(rect(0, 0, 40, 40)),
      xs.flatMap((x) => xs.map((y) => [x, y])),
    );
  });

  void test("starts the grid at the first step boundary inside the rect", () => {
    const xs = [4, 12, 20, 28, 36];
    assert.deepEqual(
      sampledPoints(rect(1, 1, 40, 40)),
      xs.flatMap((x) => xs.map((y) => [x, y])),
    );
  });

  void test("keeps every sample point inside the rect", () => {
    for (const r of [rect(3, 7, 50, 13), rect(10.5, 2.25, 9, 100)]) {
      for (const [x, y] of sampledPoints(r)) {
        assert.ok(
          x >= r.x && x <= r.x + r.width,
          `x=${x} in ${r.x}+${r.width}`,
        );
        assert.ok(
          y >= r.y && y <= r.y + r.height,
          `y=${y} in ${r.y}+${r.height}`,
        );
      }
    }
  });

  void test("yields each hit element once, including null", () => {
    const a = {} as Element;
    const b = {} as Element;
    const hits = [a, a, null, b, a, null];
    let i = 0;
    const crawler = new PointerCrawler(STEP_PX, () => hits[i++ % hits.length]);
    assert.deepEqual([...crawler.crawl(rect(0, 0, 40, 40))], [a, null, b]);
  });

  void test("stops hit testing when the consumer stops", () => {
    let calls = 0;
    const crawler = new PointerCrawler(STEP_PX, () => {
      calls++;
      return {} as Element;
    });
    crawler.crawl(rect(0, 0, 40, 40)).next();
    assert.equal(calls, 1);
  });
});
