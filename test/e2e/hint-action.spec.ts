import { test, expect, gotoTest, hit, attachHints } from "./fixtures";

test.describe("hint actions", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test("input[type=text]: hitting hint focuses the input", async ({ page }) => {
    await gotoTest(page, "input.html");
    await hit(page, "input[type=text]");

    await expect(page.locator("input[type=text]").first()).toBeFocused({
      timeout: 3_000,
    });
  });

  test("input[type=checkbox]: hitting hint checks/unchecks the checkbox", async ({
    page,
  }) => {
    await gotoTest(page, "input.html");

    const checkbox = page.locator("input[type=checkbox]").first();
    const checkedBefore = await checkbox.isChecked();

    await hit(page, "input[type=checkbox]");

    await expect(checkbox).toHaveJSProperty("checked", !checkedBefore, {
      timeout: 3_000,
    });
  });

  test("button (offseted-body): hitting hint fires onclick alert", async ({
    page,
  }) => {
    await gotoTest(page, "offseted-body.html");
    await page.locator("button").scrollIntoViewIfNeeded();

    const dialogPromise = page.waitForEvent("dialog", { timeout: 5_000 });
    await hit(page, "button");
    const dialog = await dialogPromise;
    expect(dialog.message()).toBe("ok");
    await dialog.dismiss();
  });

  test("hint data-state transitions to hit during hinting", async ({
    page,
  }) => {
    await gotoTest(page, "input.html");
    await attachHints(page);

    const firstHintText = await page
      .locator(".hint")
      .first()
      .getAttribute("data-hint");
    if (!firstHintText) throw new Error("No hint found");

    // WHY: typing the first character narrows matching hints to candidate/hit state.
    await page.keyboard.press(firstHintText[0]);

    const candidateOrHit = page.locator(
      ".hint[data-state='candidate'], .hint[data-state='hit']",
    );
    await expect(candidateOrHit.first()).toBeVisible({ timeout: 2_000 });

    await page.keyboard.up("Space");
  });
});

test.describe("editable elements inside clickable elements", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  for (const target of ["#light-ta", "#light-ce", "#shadow-ta"]) {
    test(`hitting ${target} inside role=button focuses it`, async ({
      page,
    }) => {
      await gotoTest(page, "editable-in-clickable.html");
      await hit(page, target);

      await expect(page.locator(target)).toBeFocused({ timeout: 3_000 });
    });
  }

  test("hitting a link in a rich text editor clicks the link", async ({
    page,
  }) => {
    await gotoTest(page, "editable-in-clickable.html");
    await hit(page, "#editor-link");

    await expect(page.locator("body")).toHaveAttribute(
      "data-clicked",
      "editor-link",
    );
  });
});
