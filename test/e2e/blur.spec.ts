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

  test("root frame (iframe.html): blur key blurs the focused input", async ({
    page,
  }) => {
    await gotoTest(page, "iframe.html");

    const input = page.locator("#root-input");
    await input.click();
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(input).not.toBeFocused({ timeout: 3_000 });
  });

  test("child iframe: blur key blurs the focused input", async ({ page }) => {
    await gotoTest(page, "iframe.html");

    const childFrame = page.frameLocator("iframe");
    const input = childFrame.locator("#child-input");
    await input.click();
    await expect(input).toBeFocused();

    await childFrame.locator("body").press("Escape");
    await expect(input).not.toBeFocused({ timeout: 3_000 });
  });

  test("grandchild iframe: blur key blurs the focused input", async ({
    page,
  }) => {
    await gotoTest(page, "iframe.html");

    const grandchildFrame = page.frameLocator("iframe").frameLocator("iframe");
    const input = grandchildFrame.locator("#grandchild-input");
    await input.click();
    await expect(input).toBeFocused();

    await grandchildFrame.locator("body").press("Escape");
    await expect(input).not.toBeFocused({ timeout: 3_000 });
  });

  test("hidden iframe: blur key blurs the focused input even when iframe is display:none", async ({
    page,
  }) => {
    await gotoTest(page, "hidden-iframe.html");

    // The iframe starts visible. Click the input to focus it.
    const childFrame = page.frameLocator("#child-iframe");
    const input = childFrame.locator("#hidden-input");
    await input.click();
    await expect(input).toBeFocused();

    // Now hide the iframe so its content rect disappears (simulates an
    // invisible iframe whose focused element can still intercept keys).
    await page.evaluate(() => {
      document.getElementById("child-iframe")?.classList.add("hidden");
    });

    // Press blur key from the root frame.
    await page.keyboard.press("Escape");

    // The input must lose focus even though the iframe has no visible rect.
    const rawFrame = page
      .frames()
      .find((f) => f.url().includes("hidden-iframe-child"));
    if (!rawFrame) throw new Error("hidden-iframe-child frame not found");

    await expect
      .poll(
        () =>
          rawFrame.evaluate(
            () =>
              document.activeElement === document.body ||
              document.activeElement == null,
          ),
        { timeout: 3_000 },
      )
      .toBe(true);
  });
});
