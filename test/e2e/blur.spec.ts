import { test, expect, gotoTest, setSettings } from "./fixtures";

test.describe("blur", () => {
  test.beforeEach(async ({ context }) => {
    await setSettings(context, { blurKey: "Escape" });
  });

  test("root frame: blur key blurs the active input", async ({ page }) => {
    await gotoTest(page, "input.html");

    const input = page.locator("input[type=text]");
    await input.click();
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(input).not.toBeFocused({ timeout: 3_000 });
  });

  test("child iframe: blur key blurs the active button", async ({ page }) => {
    await gotoTest(page, "iframe.html");

    const childFrame = page.frameLocator("iframe");
    const button = childFrame.locator("button");
    await button.click();
    await expect(button).toBeFocused();

    await childFrame.locator("body").press("Escape");
    await expect(button).not.toBeFocused({ timeout: 3_000 });
  });
});
