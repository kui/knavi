import {
  test,
  expect,
  gotoTest,
  attachHintsSticky,
  setSettings,
} from "./fixtures";

const STICKY_KEY = "KeyQ";
const ACTION_KEY = "Enter";
const CANCEL_KEY = "Escape";
const CYCLE_KEY = "Tab";

test.describe("cycle key on overlapping hints", () => {
  test.beforeEach(async ({ context }) => {
    await setSettings(context, {
      stickyKey: STICKY_KEY,
      actionKey: ACTION_KEY,
      cancelKey: CANCEL_KEY,
      cycleKey: CYCLE_KEY,
    });
  });

  test.afterEach(async ({ context }) => {
    await setSettings(context, {
      stickyKey: "",
      actionKey: "",
      cancelKey: "",
      cycleKey: "Tab",
    });
  });

  test("Tab cycles the hit and Action fires the cycled-to target", async ({
    page,
  }) => {
    await gotoTest(page, "overlapping-hints.html");
    await attachHintsSticky(page, STICKY_KEY);

    const hints = page.locator(".hint");
    /* WHY: the two chips stack at the same top-left; the later-inserted one
       paints on top in DOM stacking order, so the user only sees its label. */
    const topHintText = await hints.last().getAttribute("data-hint");
    const buriedHintText = await hints.first().getAttribute("data-hint");
    if (!topHintText || !buriedHintText) throw new Error("hint text missing");
    expect(topHintText).not.toBe(buriedHintText);

    for (const ch of topHintText) await page.keyboard.press(ch);

    const initialHit = await page
      .locator(".hint[data-state='hit']")
      .getAttribute("data-hint");
    expect(initialHit).toBe(topHintText);

    const hit = page.locator(".hint[data-state='hit']");
    await expect(hit).toHaveAttribute("data-cycle-key", CYCLE_KEY);
    await expect(hit).toHaveAttribute("data-cycle-count", "1");

    await page.keyboard.press(CYCLE_KEY);

    const cycledHit = await page
      .locator(".hint[data-state='hit']")
      .getAttribute("data-hint");
    expect(cycledHit).toBe(buriedHintText);

    await page.keyboard.press(ACTION_KEY);

    /* WHY: the buried target must be the one whose action fires. Since the
       chip for the front element is inserted after the back element, the
       buried target is the back button. */
    await expect
      .poll(() =>
        page.evaluate(() => document.body.getAttribute("data-back-clicked")),
      )
      .toBe("1");
    const frontClicked = await page.evaluate(() =>
      document.body.getAttribute("data-front-clicked"),
    );
    expect(frontClicked).toBeNull();
  });
});
