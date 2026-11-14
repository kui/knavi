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
      // HACK: headless: true sets the old --headless flag which blocks extensions, so pass --headless=new directly instead so extensions (and the service worker) work.
      headless: false,
      args: [
        "--headless=new",
        `--disable-extensions-except=${BUILD}`,
        `--load-extension=${BUILD}`,
      ],
    });
    // WHY: wait for the service worker to start (confirms extension is loaded).
    if (ctx.serviceWorkers().length === 0) {
      await ctx.waitForEvent("serviceworker", { timeout: 10_000 });
    }
    /* WHY: onInstalled back-fills defaults asynchronously. Content scripts read
       storage directly and only fall back to a background message while the
       defaults are missing, so wait for them to keep page loads deterministic. */
    await ctx.serviceWorkers()[0].evaluate(async () => {
      interface SW {
        chrome: {
          storage: { sync: { get(k: string): Promise<{ css?: string }> } };
        };
      }
      const { chrome } = globalThis as unknown as SW;
      const deadline = Date.now() + 10_000;
      while (!(await chrome.storage.sync.get("css")).css) {
        if (Date.now() > deadline) {
          throw new Error("onInstalled back-fill did not write css in 10 s");
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    });
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

/**
 * Set extension settings via the background service worker.
 * Only pass the keys you want to change; others remain untouched.
 */
export async function setSettings(
  context: BrowserContext,
  settings: Record<string, string>,
): Promise<void> {
  const sw = context.serviceWorkers()[0];
  // WHY: chrome is available at runtime in the service worker; not known to TS here.
  await sw.evaluate(
    (s) =>
      new Promise<void>((resolve) => {
        interface SW {
          chrome: {
            storage: { sync: { set(i: typeof s, cb: () => void): void } };
          };
        }
        (globalThis as unknown as SW).chrome.storage.sync.set(s, resolve);
      }),
    settings,
  );
}

/**
 * Navigate to a test page and wait until the root frame's content script is
 * ready.  "Ready" means the keyboard handler has finished loading settings
 * (signalled by dataset.knaviReady on the root &lt;html&gt; element).  Waiting here eliminates the race
 * between Space and async content-script setup that caused flakiness in the
 * iframe-hint test.  Child frames do not need their keyboard handlers ready —
 * hint detection only requires them to respond to AllRectsRequest, which does
 * not depend on setupKeyboardHandler completing.
 */
export async function gotoTest(page: Page, name: string): Promise<void> {
  await page.goto(name);
  await page.waitForLoadState("load");
  await page.waitForFunction(
    () => document.documentElement.dataset.knaviReady === "1",
    { timeout: 10_000 },
  );
  // WHY: click the body to ensure keyboard focus is on the page.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
}

/**
 * Press Space to activate hints and wait until at least one hint is visible.
 * The caller is responsible for releasing Space when done.
 */
export async function attachHints(page: Page): Promise<void> {
  await page.keyboard.down("Space");
  // WHY: hint elements live inside a shadow root; Playwright auto-pierces open shadows.
  await expect(page.locator(".hint").first()).toBeVisible({ timeout: 5_000 });
}

/**
 * Press and release the sticky key to activate hints in sticky mode.
 * Hints should remain visible after the key is released.
 */
export async function attachHintsSticky(
  page: Page,
  stickyKey: string,
): Promise<void> {
  await page.keyboard.press(stickyKey);
  await expect(page.locator(".hint").first()).toBeVisible({ timeout: 5_000 });
}

export interface Point {
  x: number;
  y: number;
}

const HINT_TOLERANCE_PX = 5;

function isNear(a: Point, b: Point): boolean {
  return (
    Math.abs(a.x - b.x) <= HINT_TOLERANCE_PX &&
    Math.abs(a.y - b.y) <= HINT_TOLERANCE_PX
  );
}

/**
 * Return the top-left corner and text of every rendered hint.
 *
 * INVARIANT: a frame sends all of its rects in one ResponseRectsFragment and
 * the hinter renders each fragment at once, so on a page without iframes every
 * hint is present as soon as attachHints() has seen the first one. Checks for
 * the absence of a hint rely on this and take a single snapshot.
 */
export async function hints(page: Page): Promise<(Point & { hint: string })[]> {
  const all = await page.locator(".hint").all();
  const found = await Promise.all(
    all.map(async (h) => ({
      box: await h.boundingBox(),
      hint: (await h.getAttribute("data-hint")) ?? "",
    })),
  );
  return found.flatMap(({ box, hint }) =>
    box ? [{ x: box.x, y: box.y, hint }] : [],
  );
}

export async function boxOf(
  page: Page,
  selector: string,
): Promise<Point & { width: number; height: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Cannot find bounding box for ${selector}`);
  return box;
}

/**
 * Return the hint text (`data-hint`) whose position matches `targetSelector`.
 * Throws if no matching hint is found within the tolerance.
 */
export async function findHintFor(
  page: Page,
  targetSelector: string,
): Promise<string> {
  const target = await boxOf(page, targetSelector);
  const found = (await hints(page)).find((h) => isNear(h, target));
  if (found) return found.hint;
  throw new Error(
    `No hint found near ${targetSelector} (target x=${target.x.toFixed(0)}, y=${target.y.toFixed(0)})`,
  );
}

/**
 * Count the hints whose position matches `targetSelector`.
 */
export async function countHintsFor(
  page: Page,
  targetSelector: string,
): Promise<number> {
  const target = await boxOf(page, targetSelector);
  return (await hints(page)).filter((h) => isNear(h, target)).length;
}

export async function expectHintAt(page: Page, expected: Point): Promise<void> {
  const points = (await hints(page)).map(({ x, y }) => ({ x, y }));
  expect(
    points.some((p) => isNear(p, expected)),
    `hint at (${expected.x}, ${expected.y}) among ${JSON.stringify(points)}`,
  ).toBe(true);
}

export async function expectHintAtTopLeftOf(
  page: Page,
  selector: string,
): Promise<void> {
  await expectHintAt(page, await boxOf(page, selector));
}

export async function expectNoHintOn(
  page: Page,
  selector: string,
): Promise<void> {
  const box = await boxOf(page, selector);
  const inside = (await hints(page)).filter(
    (h) =>
      h.x >= box.x - HINT_TOLERANCE_PX &&
      h.x <= box.x + box.width + HINT_TOLERANCE_PX &&
      h.y >= box.y - HINT_TOLERANCE_PX &&
      h.y <= box.y + box.height + HINT_TOLERANCE_PX,
  );
  expect(inside).toEqual([]);
}

export async function expectHintsOnlyAt(
  page: Page,
  allowed: Point[],
): Promise<void> {
  const stray = (await hints(page)).filter(
    (h) => !allowed.some((a) => isNear(h, a)),
  );
  expect(stray).toEqual([]);
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
