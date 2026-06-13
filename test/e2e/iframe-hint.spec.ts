import { test, expect, gotoTest, attachHints } from "./fixtures";

test.describe("iframe hint placement", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test("hints appear for button inside child iframe", async ({ page }) => {
    await gotoTest(page, "iframe.html");

    const childFrame = page.frameLocator("iframe");
    await childFrame.locator("button").scrollIntoViewIfNeeded();

    await attachHints(page);

    const childButton = childFrame.locator("button");
    const childButtonBox = await childButton.boundingBox();
    expect(childButtonBox).toBeTruthy();

    const hints = page.locator(".hint");
    await expect(hints).toHaveCount(4, { timeout: 5_000 });

    let found = false;
    const count = await hints.count();
    for (let i = 0; i < count; i++) {
      const box = await hints.nth(i).boundingBox();
      if (!box) continue;
      if (
        Math.abs(box.x - childButtonBox!.x) <= 10 &&
        Math.abs(box.y - childButtonBox!.y) <= 10
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBeTruthy();
  });

  test("hints appear for button inside grandchild iframe", async ({ page }) => {
    await gotoTest(page, "iframe.html");

    const grandchildFrame = page.frameLocator("iframe").frameLocator("iframe");
    await grandchildFrame.locator("button").scrollIntoViewIfNeeded();

    await attachHints(page);

    const grandchildButton = grandchildFrame.locator("button");
    const grandchildButtonBox = await grandchildButton.boundingBox();
    expect(grandchildButtonBox).toBeTruthy();

    const hints = page.locator(".hint");
    await expect(hints).toHaveCount(4, { timeout: 5_000 });

    let found = false;
    const count = await hints.count();
    for (let i = 0; i < count; i++) {
      const box = await hints.nth(i).boundingBox();
      if (!box) continue;
      if (
        Math.abs(box.x - grandchildButtonBox!.x) <= 10 &&
        Math.abs(box.y - grandchildButtonBox!.y) <= 10
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBeTruthy();
  });
});
