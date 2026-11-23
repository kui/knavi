import type { Frame, Page } from "@playwright/test";
import { test, expect, gotoTest, attachHints, findHintNear } from "./fixtures";

declare global {
  interface Window {
    closedButtons: Record<"outer" | "inner", HTMLButtonElement>;
  }
}

type ButtonName = keyof Window["closedButtons"];

async function hitHintNear(page: Page, box: { x: number; y: number }) {
  await attachHints(page);
  const hint = await findHintNear(page, box);
  for (const ch of hint) await page.keyboard.press(ch);
  await page.keyboard.up("Space");
}

/** The direct child frame of the top frame whose URL ends with `path`. */
function childFrame(page: Page, path: string): Frame {
  const frame = page
    .mainFrame()
    .childFrames()
    .find((f) => f.url().endsWith(path));
  if (!frame) throw new Error(`No child frame for ${path}`);
  return frame;
}

test.describe("hints inside closed shadow roots", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  for (const name of ["outer", "inner"] as ButtonName[]) {
    test(`a button in ${name === "outer" ? "a" : "a nested"} closed shadow root`, async ({
      page,
    }) => {
      await gotoTest(page, "closed-shadow-root.html");
      const box = await page.evaluate((n) => {
        const { x, y } = window.closedButtons[n].getBoundingClientRect();
        return { x, y };
      }, name);
      await hitHintNear(page, box);
      await expect
        .poll(() =>
          page.evaluate((n) => window.closedButtons[n].textContent, name),
        )
        .toBe("clicked");
    });
  }

  test("a button in a same-origin iframe in a closed shadow root", async ({
    page,
  }) => {
    await gotoTest(page, "closed-shadow-root-iframe.html");
    const button = childFrame(
      page,
      "/tests/cross-origin-iframe-grandchild.html",
    ).locator("#grandchild-button");
    const box = await button.boundingBox();
    expect(box).toBeTruthy();
    await hitHintNear(page, box!);
    await expect(button).toHaveText("clicked");
  });

  test("a button in a cross-origin iframe in a closed shadow root", async ({
    page,
  }) => {
    await gotoTest(page, "closed-shadow-root-iframe.html");
    const button = childFrame(
      page,
      "/tests/cross-origin-iframe-child.html",
    ).locator("#child-button");
    const box = await button.boundingBox();
    expect(box).toBeTruthy();
    await hitHintNear(page, box!);
    await expect(button).toHaveText("clicked");
  });
});
