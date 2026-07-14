import {
  test,
  expect,
  gotoTest,
  attachHintsSticky,
  findHintFor,
  setSettings,
} from "./fixtures";

const STICKY_KEY = "KeyQ";
const ACTION_KEY = "Enter";
const CANCEL_KEY = "Escape";
const BLUR_KEY = "KeyB";

test.describe("iframe blur cycle (sticky mode)", () => {
  test.beforeEach(async ({ context }) => {
    await setSettings(context, {
      stickyKey: STICKY_KEY,
      actionKey: ACTION_KEY,
      cancelKey: CANCEL_KEY,
      blurKey: BLUR_KEY,
    });
  });

  test.afterEach(async ({ context }) => {
    await setSettings(context, {
      stickyKey: "",
      actionKey: "",
      cancelKey: "",
      blurKey: "",
    });
  });

  test("hint action works after focus-blur-focus cycle on iframe element", async ({
    page,
  }) => {
    await gotoTest(page, "iframe.html");

    await attachHintsSticky(page, STICKY_KEY);
    const hintText = await findHintFor(page, "iframe");
    for (const ch of hintText) {
      await page.keyboard.press(ch);
    }
    await page.keyboard.press(ACTION_KEY);

    await page.keyboard.press(BLUR_KEY);

    // WHY: re-focus via sticky hint; the hint key must fire the action, not RemoveHints.
    await attachHintsSticky(page, STICKY_KEY);
    const hintText2 = await findHintFor(page, "iframe");
    expect(hintText2).toBeTruthy();

    for (const ch of hintText2) {
      await page.keyboard.press(ch);
    }
    // INVARIANT: hints should have been consumed (hit state reached), not cancelled.
    const hitHint = page.locator(".hint[data-state='hit']");
    await expect(hitHint).toHaveCount(1, { timeout: 2_000 });

    await page.keyboard.press(ACTION_KEY);
  });
});
