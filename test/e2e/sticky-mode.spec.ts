import {
  test,
  expect,
  gotoTest,
  attachHintsSticky,
  findHintFor,
  setSettings,
} from "./fixtures.ts";

// Use keys unlikely to conflict with the default magicKey (Space).
const STICKY_KEY = "KeyQ";
const ACTION_KEY = "Enter";
const CANCEL_KEY = "Escape";

test.describe("sticky mode", () => {
  test.beforeEach(async ({ context, page }) => {
    await setSettings(context, {
      stickyKey: STICKY_KEY,
      actionKey: ACTION_KEY,
      cancelKey: CANCEL_KEY,
    });
    await gotoTest(page, "input.html");
  });

  test.afterEach(async ({ context }) => {
    // Reset to defaults so other tests are not affected.
    await setSettings(context, { stickyKey: "", actionKey: "", cancelKey: "" });
  });

  test("sticky key attaches hints and releasing it keeps hints visible", async ({
    page,
  }) => {
    await attachHintsSticky(page, STICKY_KEY);
    // After pressing + releasing the sticky key, hints must still be visible.
    await expect(page.locator(".hint").first()).toBeVisible({ timeout: 3_000 });
  });

  test("action key fires the hit target's action", async ({ page }) => {
    await attachHintsSticky(page, STICKY_KEY);
    const hintText = await findHintFor(page, "input[type=text]");
    for (const ch of hintText) {
      await page.keyboard.press(ch);
    }
    await page.keyboard.press(ACTION_KEY);

    await expect(page.locator("input[type=text]").first()).toBeFocused({
      timeout: 3_000,
    });
  });

  test("cancel key removes hints without firing any action", async ({
    page,
  }) => {
    const checkbox = page.locator("input[type=checkbox]").first();
    const checkedBefore = await checkbox.isChecked();

    await attachHintsSticky(page, STICKY_KEY);
    const hintText = await findHintFor(page, "input[type=checkbox]");
    for (const ch of hintText) {
      await page.keyboard.press(ch);
    }
    await page.keyboard.press(CANCEL_KEY);

    await expect(page.locator(".hint").first()).not.toBeVisible({
      timeout: 3_000,
    });
    // Checkbox must not have toggled.
    expect(await checkbox.isChecked()).toBe(checkedBefore);
  });

  test("action key also fires for a magic key hold session", async ({
    page,
  }) => {
    await page.keyboard.down("Space");
    await expect(page.locator(".hint").first()).toBeVisible({ timeout: 5_000 });
    const hintText = await findHintFor(page, "input[type=text]");
    for (const ch of hintText) {
      await page.keyboard.press(ch);
    }
    await page.keyboard.press(ACTION_KEY);
    await page.keyboard.up("Space");

    await expect(page.locator("input[type=text]").first()).toBeFocused({
      timeout: 3_000,
    });
  });
});
