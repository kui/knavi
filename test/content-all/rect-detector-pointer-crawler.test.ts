import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PointerCrawler } from "../../src/content-all/rect-detector-pointer-crawler.js";
import { Rect } from "../../src/dom/rects.js";

type R = ReturnType<typeof rect>;

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

function sampledPoints(r: R): [number, number][] {
  const points: [number, number][] = [];
  const crawler = new PointerCrawler((x, y) => {
    points.push([x, y]);
    return {} as Element;
  });
  void [...crawler.crawl(r)];
  return points;
}

const centre = (r: R): [number, number] => [
  r.x + r.width / 2,
  r.y + r.height / 2,
];

// WHY: isSmallRect() drops rects of 4 px or less before PointerCrawler sees them, so these cover sizes just above that, fractional positions and sizes, and large and elongated rects.
const RECTS = [
  ...[5, 6, 7].flatMap((size) =>
    [0, 1, 2, 3, 0.5].map((offset) => rect(offset, offset, size, size)),
  ),
  rect(0.25, 0.5, 4.5, 5.25),
  rect(0, 0, 40, 40),
  rect(3, 7, 50, 13),
  rect(40, 80, 120, 400),
  rect(360, 200, 400, 40),
];

void describe("PointerCrawler", () => {
  void test("tests the centre first", () => {
    for (const r of RECTS) assert.deepEqual(sampledPoints(r)[0], centre(r));
  });

  void test("keeps every sample point strictly inside the rect", () => {
    for (const r of RECTS)
      for (const [x, y] of sampledPoints(r)) {
        assert.ok(x > r.x && x < r.x + r.width, `x=${x} in ${r.x}+${r.width}`);
        assert.ok(
          y > r.y && y < r.y + r.height,
          `y=${y} in ${r.y}+${r.height}`,
        );
      }
  });

  void test("tests points within 1 px of every edge", () => {
    for (const r of RECTS) {
      const points = sampledPoints(r);
      const near = (a: number, b: number) => Math.abs(a - b) <= 1;
      const label = `${r.x},${r.y} ${r.width}x${r.height}`;
      assert.ok(
        points.some(([x]) => near(x, r.x)),
        `left of ${label}`,
      );
      assert.ok(
        points.some(([x]) => near(x, r.x + r.width)),
        `right of ${label}`,
      );
      assert.ok(
        points.some(([, y]) => near(y, r.y)),
        `top of ${label}`,
      );
      assert.ok(
        points.some(([, y]) => near(y, r.y + r.height)),
        `bottom of ${label}`,
      );
    }
  });

  void test("tests the remaining points nearest to the centre first", () => {
    for (const r of RECTS) {
      const [c, ...rest] = sampledPoints(r);
      const distances = rest.map(([x, y]) => Math.hypot(x - c[0], y - c[1]));
      assert.deepEqual(
        distances,
        [...distances].sort((a, b) => a - b),
      );
    }
  });

  void test("tests no point twice and at most 17 points", () => {
    for (const r of RECTS) {
      const points = sampledPoints(r);
      assert.equal(new Set(points.map((p) => p.join())).size, points.length);
      assert.ok(points.length <= 17, `${points.length} points`);
    }
  });

  void test("yields each hit element once, including null", () => {
    const a = {} as Element;
    const b = {} as Element;
    const hits = [a, a, null, b, a, null];
    let i = 0;
    const crawler = new PointerCrawler(() => hits[i++ % hits.length]);
    assert.deepEqual([...crawler.crawl(rect(0, 0, 40, 40))], [a, null, b]);
  });

  void test("stops hit testing when the consumer stops", () => {
    let calls = 0;
    const crawler = new PointerCrawler(() => {
      calls++;
      return {} as Element;
    });
    crawler.crawl(rect(0, 0, 40, 40)).next();
    assert.equal(calls, 1);
  });
});
