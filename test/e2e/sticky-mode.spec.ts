import {
  test,
  expect,
  gotoTest,
  attachHintsSticky,
  findHintFor,
  setSettings,
} from "./fixtures";

// WHY: use keys unlikely to conflict with the default magicKey (Space).
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
    // WHY: reset to defaults so other tests are not affected.
    await setSettings(context, { stickyKey: "", actionKey: "", cancelKey: "" });
  });

  test("sticky key attaches hints and releasing it keeps hints visible", async ({
    page,
  }) => {
    await attachHintsSticky(page, STICKY_KEY);
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
    expect(await checkbox.isChecked()).toBe(checkedBefore);
  });

  test("second sticky session works after an action steals focus", async ({
    page,
  }) => {
    // WHY: fire the action with the Action Key DOWN only and never send its keyup, simulating a target=_blank action that steals focus before keyup arrives.
    await attachHintsSticky(page, STICKY_KEY);
    const hintText1 = await findHintFor(page, "input[type=checkbox]");
    for (const ch of hintText1) {
      await page.keyboard.press(ch);
    }
    await page.keyboard.down(ACTION_KEY);
    await expect(page.locator(".hint").first()).not.toBeVisible({
      timeout: 3_000,
    });

    // INVARIANT: hints must appear and stay visible after one hint letter; the stuck Action Key must not spuriously fire removeHints.
    await attachHintsSticky(page, STICKY_KEY);
    const hintText2 = await findHintFor(page, "input[type=text]");
    await page.keyboard.press(hintText2[0]);
    await expect(page.locator(".hint").first()).toBeVisible({ timeout: 3_000 });

    await page.keyboard.up(ACTION_KEY).catch(() => void 0);
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
