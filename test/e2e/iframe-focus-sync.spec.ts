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

test.describe("hint session sync across frames", () => {
  test.beforeEach(async ({ context }) => {
    await setSettings(context, {
      stickyKey: STICKY_KEY,
      actionKey: ACTION_KEY,
      cancelKey: CANCEL_KEY,
    });
  });

  test.afterEach(async ({ context }) => {
    await setSettings(context, { stickyKey: "", actionKey: "", cancelKey: "" });
  });

  test("hint letters typed while focus is in a non-initiating iframe still hit", async ({
    page,
  }) => {
    await gotoTest(page, "iframe.html");

    const childFrame = page.frameLocator("iframe");
    const childInput = childFrame.locator("#child-input");
    /* WHY: the letters below are typed inside the child frame, so its
       keyboard handler must be set up; gotoTest only waits for the root. */
    await expect(childFrame.locator("html")).toHaveAttribute(
      "data-knavi-ready",
      "1",
    );

    // WHY: the root frame holds focus here, so the root initiates the session.
    await attachHintsSticky(page, STICKY_KEY);
    const hintText = await findHintFor(page, "iframe");

    await childInput.focus();
    for (const ch of hintText) {
      await page.keyboard.press(ch);
    }

    // INVARIANT: the letters must be routed to hitHint, not typed into the input.
    const hitHint = page.locator(".hint[data-state='hit']");
    await expect(hitHint).toHaveCount(1, { timeout: 2_000 });
    await expect(childInput).toHaveValue("");

    await page.keyboard.press(CANCEL_KEY);
  });
});
