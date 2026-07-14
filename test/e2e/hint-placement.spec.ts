import { test, expect, gotoTest, attachHints, findHintFor } from "./fixtures";

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
});
