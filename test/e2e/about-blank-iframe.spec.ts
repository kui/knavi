import type { Page } from "@playwright/test";
import { test, expect, gotoTest, attachHints } from "./fixtures";

async function findHintNear(
  page: Page,
  target: { x: number; y: number },
): Promise<string | null> {
  for (const hint of await page.locator(".hint").all()) {
    const box = await hint.boundingBox();
    if (
      box &&
      Math.abs(box.x - target.x) <= 5 &&
      Math.abs(box.y - target.y) <= 5
    ) {
      return await hint.getAttribute("data-hint");
    }
  }
  return null;
}

test.describe("about:blank iframe", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test("button inside a src-less iframe gets a hint and is clickable", async ({
    page,
  }) => {
    await gotoTest(page, "about-blank-iframe.html");

    const buttonBox = await page
      .frameLocator("iframe")
      .locator("button")
      .boundingBox();
    expect(buttonBox).toBeTruthy();

    await attachHints(page);

    let hintText: string | null = null;
    await expect
      .poll(async () => (hintText = await findHintNear(page, buttonBox!)), {
        timeout: 5_000,
      })
      .not.toBeNull();

    for (const ch of hintText!) await page.keyboard.press(ch);
    await page.keyboard.up("Space");

    await expect(page.locator("#result")).toHaveText("clicked");
  });
});
