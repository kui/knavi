import {
  test,
  expect,
  gotoTest,
  attachHintsSticky,
  findHintNear,
  boxOf,
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
    /* WHY: the blur key is handled by the frame that holds focus, so the child
       frame's keyboard handler must be set up; gotoTest only waits for the
       root. */
    await expect(page.frameLocator("iframe").locator("html")).toHaveAttribute(
      "data-knavi-ready",
      "1",
    );

    await attachHintsSticky(page, STICKY_KEY);
    const hintText = await findHintNear(page, await boxOf(page, "iframe"));
    for (const ch of hintText) {
      await page.keyboard.press(ch);
    }
    await page.keyboard.press(ACTION_KEY);
    /* WHY: RemoveHints reaches content-root asynchronously; wait for the
       previous session's hints to go so attachHintsSticky below does not
       return on a leftover hint. */
    await expect(page.locator(".hint")).toHaveCount(0);
    await expect(page.locator("iframe")).toBeFocused();

    await page.keyboard.press(BLUR_KEY);
    await expect(page.locator("iframe")).not.toBeFocused();

    // WHY: re-focus via sticky hint; the hint key must fire the action, not RemoveHints.
    await attachHintsSticky(page, STICKY_KEY);
    const hintText2 = await findHintNear(page, await boxOf(page, "iframe"));
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
