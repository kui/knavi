import type { Page } from "@playwright/test";
import {
  test,
  expect,
  gotoTest,
  attachHints,
  boxOf,
  expectHintAt,
  expectHintAtTopLeftOf,
  expectHintsOnlyAt,
  expectNoHintOn,
} from "./fixtures";

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
      await expectNoHintOn(page, "a");
    });

    test("a link whose top is inside its overflow parent gets a hint at its corner", async ({
      page,
    }) => {
      await gotoTest(page, "crop-by-parent-dom.html");
      await scrollParent(page, 200);
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "a");
    });

    test("a link whose top is scrolled out of its overflow parent gets a hint at the parent's top edge", async ({
      page,
    }) => {
      await gotoTest(page, "crop-by-parent-dom.html");
      await scrollParent(page, 300);
      await attachHints(page);
      const link = await boxOf(page, "a");
      const parent = await boxOf(page, "#parent");
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
      await expectHintAtTopLeftOf(page, "#image-link img");
    });

    test("a clickable span that contains an image gets a hint on the image", async ({
      page,
    }) => {
      await gotoTest(page, "larger-child-element-than-parent.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#image-span img");
    });

    for (const id of [
      "detached-children",
      "detached-children-with-offset-parent",
    ]) {
      test(`#${id}: a clickable element gets a hint on its absolute child`, async ({
        page,
      }) => {
        await gotoTest(page, "larger-child-element-than-parent.html");
        await page.locator(`#${id} > div`).scrollIntoViewIfNeeded();
        await attachHints(page);
        await expectHintAtTopLeftOf(page, `#${id} > div`);
      });
    }

    test("a relative clickable element wider than its overflow parent gets a hint", async ({
      page,
    }) => {
      await gotoTest(page, "larger-child-element-than-parent.html");
      await page.locator("#wider-than-parent").scrollIntoViewIfNeeded();
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#wider-than-parent");
    });
  });

  test.describe("details", () => {
    async function setOpen(page: Page, open: boolean) {
      await page.evaluate((open) => {
        for (const d of document.querySelectorAll("details")) d.open = open;
      }, open);
    }

    test("closed <details> get hints only on themselves, not on the buttons inside", async ({
      page,
    }) => {
      await gotoTest(page, "details.html");
      await setOpen(page, false);
      await attachHints(page);
      await expectHintsOnlyAt(page, [
        await boxOf(page, "#with-summary"),
        await boxOf(page, "#without-summary"),
      ]);
    });

    test("buttons inside open <details> get hints", async ({ page }) => {
      await gotoTest(page, "details.html");
      await setOpen(page, true);
      await attachHints(page);
      await expectHintAtTopLeftOf(page, "#mouseup-button");
      await expectHintAtTopLeftOf(page, "#click-button");
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
      await expectHintAtTopLeftOf(page, "#hide-popover");
      await expectHintAtTopLeftOf(page, "#high-zindex");
    });

    test("a button in a closed popover gets no hint", async ({ page }) => {
      await gotoTest(page, "toplayer.html");
      await page.evaluate(() => {
        const p = document.getElementById("p1")!;
        if (p.matches(":popover-open")) p.hidePopover();
      });
      await attachHints(page);
      await expectHintsOnlyAt(page, [
        await boxOf(page, "#high-zindex"),
        await boxOf(page, "#show-popover"),
      ]);
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
      const link = await boxOf(page, "#clipped-top-left");
      const clip = await boxOf(page, ".clip");
      expect(link.x).toBeLessThan(clip.x);
      expect(link.y).toBeLessThan(clip.y);
      await expectHintAt(page, clip);
    });

    test("a link fully clipped by its parent gets no hint", async ({
      page,
    }) => {
      await gotoTest(page, "clipped-by-overflow-hidden.html");
      await attachHints(page);
      await expectNoHintOn(page, "#fully-clipped");
    });

    test("a link clipped by an ancestor beyond an overflow: visible parent gets a hint at the visible part", async ({
      page,
    }) => {
      await gotoTest(page, "clipped-by-overflow-hidden.html");
      await attachHints(page);
      const link = await boxOf(page, "#clipped-by-grandparent");
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
      const fixed = await boxOf(page, "#fixed");
      const clip = await boxOf(page, ".clip");
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
        const box = a.getBoundingClientRect();
        return {
          first: { x: rects[0].x, y: rects[0].y },
          box: { x: box.x, y: box.y },
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
    const link = await boxOf(page, "#tall");
    expect(link.y).toBeLessThan(0);
    await expectHintAt(page, { x: link.x, y: 0 });
  });

  test.describe("small-elements", () => {
    for (const size of [5, 6, 7])
      for (const offset of [0, 1, 2, 3])
        test(`a ${size} px link at offset ${offset} gets a hint`, async ({
          page,
        }) => {
          await gotoTest(page, "small-elements.html");
          await attachHints(page);
          await expectHintAtTopLeftOf(page, `#s${size}-o${offset}`);
        });
  });

  for (const id of [
    "top-strip",
    "bottom-strip",
    "left-strip",
    "right-strip",
    "small-covered-centre",
  ]) {
    test(`edge-strips: #${id} gets a hint`, async ({ page }) => {
      await gotoTest(page, "edge-strips.html");
      await attachHints(page);
      await expectHintAtTopLeftOf(page, `#${id}`);
    });
  }
});
