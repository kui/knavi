import type { Page } from "@playwright/test";
import { test, expect, gotoTest, attachHints } from "./fixtures";

interface Point {
  x: number;
  y: number;
}

const TOLERANCE_PX = 2;

async function hintPoints(page: Page): Promise<Point[]> {
  const boxes = await Promise.all(
    (await page.locator(".hint").all()).map((hint) => hint.boundingBox()),
  );
  return boxes.flatMap((box) => (box ? [{ x: box.x, y: box.y }] : []));
}

function isNear(a: Point, b: Point): boolean {
  return (
    Math.abs(a.x - b.x) <= TOLERANCE_PX && Math.abs(a.y - b.y) <= TOLERANCE_PX
  );
}

async function expectHintAt(page: Page, expected: Point): Promise<void> {
  // WHY: hints are rendered after the first one becomes visible, so poll until the expected one shows up.
  await expect
    .poll(async () => (await hintPoints(page)).some((p) => isNear(p, expected)))
    .toBe(true);
}

async function topLeftOf(page: Page, selector: string): Promise<Point> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Cannot find bounding box for ${selector}`);
  return { x: box.x, y: box.y };
}

async function expectHintAtTopLeftOf(
  page: Page,
  selector: string,
): Promise<void> {
  await expectHintAt(page, await topLeftOf(page, selector));
}

async function expectNoHintOn(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Cannot find bounding box for ${selector}`);
  const inside = (await hintPoints(page)).filter(
    (p) =>
      p.x >= box.x - TOLERANCE_PX &&
      p.x <= box.x + box.width + TOLERANCE_PX &&
      p.y >= box.y - TOLERANCE_PX &&
      p.y <= box.y + box.height + TOLERANCE_PX,
  );
  expect(inside).toEqual([]);
}

async function expectHintsOnlyAt(page: Page, allowed: Point[]): Promise<void> {
  const stray = (await hintPoints(page)).filter(
    (p) => !allowed.some((a) => isNear(p, a)),
  );
  expect(stray).toEqual([]);
}

test.describe("visibility", () => {
  test.afterEach(async ({ page }) => {
    // WHY: release Space in case a test did not do so.
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test.describe("crop-by-parent-dom", () => {
    async function scrollParent(page: Page, px: number) {
      await page.evaluate((px) => {
        document.getElementById("parent")!.scrollTop = px;
      }, px);
    }

    test("a link scrolled out of its overflow parent gets no hint", async ({
      page,
    }) => {
      await gotoTest(page, "crop-by-parent-dom.html");
      await scrollParent(page, 0);
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#parent");
      await expectNoHintOn(page, "a");
    });

    test("a link fully inside its overflow parent gets a hint at its corner", async ({
      page,
    }) => {
      await gotoTest(page, "crop-by-parent-dom.html");
      await scrollParent(page, 200);
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "a");
    });

    test("a link partly scrolled out of its overflow parent gets a hint at the parent's top edge", async ({
      page,
    }) => {
      await gotoTest(page, "crop-by-parent-dom.html");
      await scrollParent(page, 300);
      await attachHints(page);
      const link = await topLeftOf(page, "a");
      const parent = await topLeftOf(page, "#parent");
      expect(link.y).toBeLessThan(parent.y);
      await expectHintAt(page, { x: link.x, y: parent.y });
    });
  });

  test.describe("larger-child-element-than-parent", () => {
    test("a link that only contains an image gets a hint on the image", async ({
      page,
    }) => {
      await gotoTest(page, "larger-child-element-than-parent.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "a img");
    });

    test("a clickable span that contains an image gets a hint on the image", async ({
      page,
    }) => {
      await gotoTest(page, "larger-child-element-than-parent.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "span img");
    });

    for (const [index, name] of [
      [0, "with only detached children"],
      [1, "with detached children and an offsetParent"],
    ] as const) {
      test(`a clickable element ${name} gets a hint on its child`, async ({
        page,
      }) => {
        await gotoTest(page, "larger-child-element-than-parent.html");
        const clickable = page.locator("div[onclick]").nth(index);
        await clickable.locator("div").scrollIntoViewIfNeeded();
        await attachHints(page);
        const box = await clickable.locator("div").boundingBox();
        await expectHintAt(page, box!);
      });
    }

    test("a relative clickable element wider than its overflow parent gets a hint", async ({
      page,
    }) => {
      await gotoTest(page, "larger-child-element-than-parent.html");
      const clickable = page.locator("div[onclick]").nth(2);
      await clickable.scrollIntoViewIfNeeded();
      await attachHints(page);
      await expectHintAt(page, (await clickable.boundingBox())!);
    });
  });

  test.describe("details", () => {
    async function setOpen(page: Page, open: boolean) {
      await page.evaluate((open) => {
        for (const d of document.querySelectorAll("details")) d.open = open;
      }, open);
    }

    test("buttons inside closed <details> get no hint", async ({ page }) => {
      await gotoTest(page, "details.html");
      await setOpen(page, false);
      await attachHints(page);
      const summaries = await Promise.all(
        (await page.locator("details").all()).map(
          async (d) => (await d.boundingBox())!,
        ),
      );
      await expectHintAt(page, summaries[1]);
      await expectHintsOnlyAt(page, summaries);
    });

    test("buttons inside open <details> get hints", async ({ page }) => {
      await gotoTest(page, "details.html");
      await setOpen(page, true);
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "button[onmouseup]");
      await expectHintAtTopLeftOf(page, "button[onclick]");
    });
  });

  test.describe("toplayer", () => {
    test("a button in an open popover gets a hint", async ({ page }) => {
      await gotoTest(page, "toplayer.html");
      await page.evaluate(() => {
        const p = document.getElementById("p1")!;
        if (!p.matches(":popover-open")) p.showPopover();
      });
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#p1 button");
      await expectHintAtTopLeftOf(page, "div[onclick]");
    });

    test("a button in a closed popover gets no hint", async ({ page }) => {
      await gotoTest(page, "toplayer.html");
      await page.evaluate(() => {
        const p = document.getElementById("p1")!;
        if (p.matches(":popover-open")) p.hidePopover();
      });
      await attachHints(page);
      const allowed = [
        await topLeftOf(page, "div[onclick]"),
        await topLeftOf(page, "button[popovertargetaction=show]"),
      ];
      await expectHintAt(page, allowed[0]);
      await expectHintAt(page, allowed[1]);
      await expectHintsOnlyAt(page, allowed);
    });
  });

  for (const name of [
    "offseted-body-with-html-padding.html",
    "offseted-body-with-html-padding2.html",
  ]) {
    test(`${name}: button hint aligns with the button`, async ({ page }) => {
      await gotoTest(page, name);
      await page.locator("button").scrollIntoViewIfNeeded();
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "button");
    });
  }

  test.describe("covered-element", () => {
    test("a fully covered button gets no hint", async ({ page }) => {
      await gotoTest(page, "covered-element.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#uncovered");
      await expectNoHintOn(page, "#covered");
    });

    test("a partially covered button gets a hint", async ({ page }) => {
      await gotoTest(page, "covered-element.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#partially-covered");
    });
  });

  test.describe("clipped-by-overflow-hidden", () => {
    test("a link clipped by its parent gets a hint at the visible corner", async ({
      page,
    }) => {
      await gotoTest(page, "clipped-by-overflow-hidden.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, ".clip");
    });

    test("a link fully clipped by its parent gets no hint", async ({
      page,
    }) => {
      await gotoTest(page, "clipped-by-overflow-hidden.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, ".clip");
      await expectNoHintOn(page, "#fully-clipped");
    });

    test("a link clipped by an ancestor beyond an overflow: visible parent gets a hint at the visible part", async ({
      page,
    }) => {
      await gotoTest(page, "clipped-by-overflow-hidden.html");
      await attachHints(page);
      const link = await topLeftOf(page, "#clipped-by-grandparent");
      const clip = (await page.locator(".clip").nth(2).boundingBox())!;
      expect(link.y).toBeLessThan(clip.y);
      await expectHintAt(page, { x: link.x, y: clip.y });
    });
  });

  test.describe("fixed-in-overflow-hidden", () => {
    test("a fixed element outside its overflow: hidden parent gets a hint", async ({
      page,
    }) => {
      await gotoTest(page, "fixed-in-overflow-hidden.html");
      await attachHints(page);
      const fixed = await topLeftOf(page, "#fixed");
      const clip = (await page.locator(".clip").first().boundingBox())!;
      expect(fixed.x).toBeGreaterThan(clip.x + clip.width);
      await expectHintAt(page, fixed);
    });

    test("a sticky element stuck in a scrolled overflow: hidden parent gets a hint", async ({
      page,
    }) => {
      await gotoTest(page, "fixed-in-overflow-hidden.html");
      await page.evaluate(() => {
        document.getElementById("scroller")!.scrollTop = 100;
      });
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#scroller");
      await expectHintAtTopLeftOf(page, "#sticky");
    });
  });

  test("wrapped-inline-link: the hint is on the first line's rect", async ({
    page,
  }) => {
    await gotoTest(page, "wrapped-inline-link.html");
    await attachHints(page);
    const { first, box, lines } = await page
      .locator("#wrapped")
      .evaluate((a) => {
        const rects = a.getClientRects();
        return {
          first: { x: rects[0].x, y: rects[0].y },
          box: a.getBoundingClientRect().toJSON() as Point,
          lines: rects.length,
        };
      });
    expect(lines).toBeGreaterThan(1);
    expect(first.x).toBeGreaterThan(box.x + 10);
    await expectHintAt(page, first);
  });

  test("crop-by-viewport: a link partly above the viewport gets a hint at the viewport top", async ({
    page,
  }) => {
    await gotoTest(page, "crop-by-viewport.html");
    await page.evaluate(() => window.scrollTo(0, 300));
    await attachHints(page);
    const link = await topLeftOf(page, "#tall");
    expect(link.y).toBeLessThan(0);
    await expectHintAt(page, { x: link.x, y: 0 });
  });
});
