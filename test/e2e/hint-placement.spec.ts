import {
  test,
  expect,
  gotoTest,
  attachHints,
  findHintFor,
  countHintsFor,
  hit,
} from "./fixtures";

test.describe("hint placement", () => {
  test.afterEach(async ({ page }) => {
    // WHY: release Space in case a test did not do so.
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test("offseted-body: button hint aligns with button position", async ({
    page,
  }) => {
    await gotoTest(page, "offseted-body.html");
    await page.locator("button").scrollIntoViewIfNeeded();
    await attachHints(page);

    const hintText = await findHintFor(page, "button");
    expect(hintText).toBeTruthy();

    await page.keyboard.up("Space");
  });

  test("input.html: hints appear for visible inputs", async ({ page }) => {
    await gotoTest(page, "input.html");
    await attachHints(page);

    const hints = page.locator(".hint");
    await expect(hints.first()).toBeVisible();
    const count = await hints.count();
    expect(count).toBeGreaterThan(5);

    await page.keyboard.up("Space");
  });

  test("input.html: text input hint aligns with element position", async ({
    page,
  }) => {
    await gotoTest(page, "input.html");
    await attachHints(page);

    await findHintFor(page, "input[type=text]");

    await page.keyboard.up("Space");
  });

  test("input.html: checkbox hint aligns with element position", async ({
    page,
  }) => {
    await gotoTest(page, "input.html");
    await attachHints(page);

    await findHintFor(page, "input[type=checkbox]");

    await page.keyboard.up("Space");
  });

  test("area.html: area elements get hints", async ({ page }) => {
    await gotoTest(page, "area.html");
    await attachHints(page);

    const hints = page.locator(".hint");
    const count = await hints.count();
    // WHY: 4 <area> elements (default, rect, circle, poly)
    expect(count).toBeGreaterThanOrEqual(4);

    await page.keyboard.up("Space");
  });

  test("shadow-in-overflow-hidden: shadow controls get hints", async ({
    page,
  }) => {
    await gotoTest(page, "shadow-in-overflow-hidden.html");
    await attachHints(page);

    // WHY: Playwright CSS locators pierce open shadow roots.
    await findHintFor(page, "#shadow-play");
    await findHintFor(page, "#shadow-mute");

    await page.keyboard.up("Space");
  });

  test("shadow-in-overflow-hidden: hitting a shadow control clicks it", async ({
    page,
  }) => {
    await gotoTest(page, "shadow-in-overflow-hidden.html");
    await hit(page, "#shadow-play");

    await expect(page.locator("body")).toHaveAttribute(
      "data-clicked",
      "shadow-play",
    );
  });

  test("shadow-in-overflow-hidden: element covered by a shadow overlay gets no hint", async ({
    page,
  }) => {
    await gotoTest(page, "shadow-in-overflow-hidden.html");
    await attachHints(page);

    await findHintFor(page, "#light-button");
    await expect(findHintFor(page, "#occluded-button")).rejects.toThrow(
      /No hint found/,
    );

    await page.keyboard.up("Space");
  });
});

test.describe("duplicate hints across shadow boundaries", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  for (const target of ["#a-link", "#b-host", "#d-button"]) {
    test(`${target} gets exactly one hint`, async ({ page }) => {
      await gotoTest(page, "shadow-duplicate-hints.html");
      await attachHints(page);

      expect(await countHintsFor(page, target)).toBe(1);
    });
  }

  test("hitting a pointer box inside a link follows the link", async ({
    page,
  }) => {
    await gotoTest(page, "shadow-duplicate-hints.html");
    await hit(page, "#a-link");

    await expect(page).toHaveURL(/#a-clicked$/);
  });

  test("hitting a pointer host clicks it", async ({ page }) => {
    await gotoTest(page, "shadow-duplicate-hints.html");
    await hit(page, "#b-host");

    await expect(page.locator("body")).toHaveAttribute(
      "data-clicked",
      "b-host",
    );
  });

  test("hitting a pointer wrapper's button clicks the button", async ({
    page,
  }) => {
    await gotoTest(page, "shadow-duplicate-hints.html");
    await hit(page, "#d-button");

    await expect(page.locator("body")).toHaveAttribute(
      "data-clicked",
      "d-button",
    );
  });

  test("hitting a pointer control in a shadow tree inside a pointer wrapper clicks the control", async ({
    page,
  }) => {
    await gotoTest(page, "shadow-duplicate-hints.html");
    await hit(page, "#e-control");

    await expect(page.locator("body")).toHaveAttribute(
      "data-clicked",
      "e-control",
    );
  });

  // WHY: stacked siblings have no ancestor relation, so the dedupe leaves both (#129).
  test.fail("stacked pointer siblings get one hint", async ({ page }) => {
    await gotoTest(page, "shadow-duplicate-hints.html");
    await attachHints(page);

    expect(await countHintsFor(page, "#c-front")).toBe(1);
  });
});
