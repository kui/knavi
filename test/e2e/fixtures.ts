import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILD = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../build",
);

interface Fixtures {
  context: BrowserContext;
  page: Page;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), "knavi-e2e-"));
    const ctx = await chromium.launchPersistentContext(userDataDir, {
      // headless: true sets the old --headless flag which blocks extensions.
      // Pass --headless=new directly so extensions (and the service worker) work.
      headless: false,
      args: [
        "--headless=new",
        `--disable-extensions-except=${BUILD}`,
        `--load-extension=${BUILD}`,
      ],
    });
    // Wait for the service worker to start (confirms extension is loaded).
    if (ctx.serviceWorkers().length === 0) {
      await ctx.waitForEvent("serviceworker", { timeout: 10_000 });
    }
    await use(ctx);
    await ctx.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };

// ---------------------------------------------------------------------------
// Helpers shared across specs
// ---------------------------------------------------------------------------

/**
 * Navigate to a test page and wait until the content script is ready
 * (the document has finished loading).
 */
export async function gotoTest(page: Page, name: string): Promise<void> {
  await page.goto(name);
  await page.waitForLoadState("load");
  // Click the body to ensure keyboard focus is on the page.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
}

/**
 * Press Space to activate hints and wait until at least one hint is visible.
 * The caller is responsible for releasing Space when done.
 */
export async function attachHints(page: Page): Promise<void> {
  await page.keyboard.down("Space");
  // Hint elements live inside a shadow root; Playwright auto-pierces open shadows.
  await expect(page.locator(".hint").first()).toBeVisible({ timeout: 5_000 });
}

/**
 * Return the hint text (`data-hint`) whose position matches `targetSelector`.
 * Throws if no matching hint is found within the tolerance.
 */
export async function findHintFor(
  page: Page,
  targetSelector: string,
  tolerancePx = 5,
): Promise<string> {
  const targetBox = await page.locator(targetSelector).first().boundingBox();
  if (!targetBox)
    throw new Error(`Cannot find bounding box for ${targetSelector}`);

  const hints = page.locator(".hint");
  const count = await hints.count();
  for (let i = 0; i < count; i++) {
    const hintEl = hints.nth(i);
    const box = await hintEl.boundingBox();
    if (!box) continue;
    if (
      Math.abs(box.x - targetBox.x) <= tolerancePx &&
      Math.abs(box.y - targetBox.y) <= tolerancePx
    ) {
      return (await hintEl.getAttribute("data-hint")) ?? "";
    }
  }
  throw new Error(
    `No hint found near ${targetSelector} (target x=${targetBox.x.toFixed(0)}, y=${targetBox.y.toFixed(0)})`,
  );
}

/**
 * Full hint activation flow: attach hints → find hint for target → type hint
 * letters → release Space (triggers the action).
 */
export async function hit(page: Page, targetSelector: string): Promise<void> {
  await attachHints(page);
  const hintText = await findHintFor(page, targetSelector);
  for (const ch of hintText) {
    await page.keyboard.press(ch);
  }
  await page.keyboard.up("Space");
}
