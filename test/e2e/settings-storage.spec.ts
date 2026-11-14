import type { Page } from "@playwright/test";
import {
  test,
  expect,
  gotoTest,
  setSettings,
  getSettings,
  attachHints,
} from "./fixtures";

const CANCEL_KEY = "Escape";

/**
 * Retry until the hints use only `letters` and hitting one works. Every
 * attempt ends with the cancel key (so no hint action runs) and releases
 * Space: content-all defers reloading settings while hinting, so a held Space
 * would keep the old letters in place.
 */
async function expectHintLetters(page: Page, letters: string): Promise<void> {
  await expect(async () => {
    await page.keyboard.down("Space");
    try {
      const first = page.locator(".hint").first();
      await expect(first).toBeVisible({ timeout: 500 });
      const label = (await first.getAttribute("data-hint")) ?? "";
      expect([...label].every((c) => letters.includes(c))).toBe(true);
      for (const c of label) await page.keyboard.press(c);
      await expect(page.locator(".hint[data-state='hit']")).toHaveCount(1, {
        timeout: 500,
      });
    } finally {
      await page.keyboard.press(CANCEL_KEY);
      await page.keyboard.up("Space");
    }
  }).toPass({ timeout: 10_000 });
}

test.describe("settings read directly from storage", () => {
  test("a page load sends only GetFrameId, and hinting sends no settings message", async ({
    context,
    page,
  }) => {
    const sw = context.serviceWorkers()[0];
    await sw.evaluate(() => {
      interface SW {
        chrome: {
          runtime: {
            onMessage: {
              addListener(l: (m: { "@type"?: string }) => void): void;
            };
          };
        };
        __seen: string[];
      }
      const g = globalThis as unknown as SW;
      g.__seen = [];
      g.chrome.runtime.onMessage.addListener((m) => {
        g.__seen.push(String(m["@type"]));
      });
    });
    const readSeen = async () => {
      const seen = await sw.evaluate(
        () => (globalThis as unknown as { __seen?: string[] }).__seen,
      );
      // WHY: the spy lives on this worker instance; fail loudly if it was lost.
      if (!Array.isArray(seen)) throw new Error("message spy was lost");
      return seen;
    };

    await gotoTest(page, "input.html");
    // WHY: positive control: proves the spy receives messages from the content scripts. GetFrameId can arrive after `knaviReady`, so poll.
    await expect.poll(readSeen).toContain("GetFrameId");
    // WHY: rect-aggregator fetches its frame id on startup, which is outside the settings reads this test covers.
    expect((await readSeen()).filter((t) => t !== "GetFrameId")).toEqual([]);

    /* WHY: showing hints needs content-root's settings, which load
       independently of content-all's `knaviReady`, so a settings message from
       content-root would have been sent by now. */
    await attachHints(page);
    await page.keyboard.up("Space");
    expect(
      (await readSeen()).filter((t) =>
        ["GetSettings", "MatchBlacklist"].includes(t),
      ),
    ).toEqual([]);
  });

  test("blacklist applies on load and its removal takes effect without reloading", async ({
    baseURL,
    context,
    page,
  }) => {
    // WHY: positive control: without a blacklist this page shows hints.
    await gotoTest(page, "input.html");
    await attachHints(page);
    await page.keyboard.up("Space");

    await setSettings(context, {
      blackList: new URL("input.html", baseURL).href,
    });
    await gotoTest(page, "input.html");
    await page.keyboard.down("Space");
    // WHY: absence cannot be awaited; hints render well within this time when not blacklisted.
    await page.waitForTimeout(1_000);
    await expect(page.locator(".hint")).toHaveCount(0);
    await page.keyboard.up("Space");

    await setSettings(context, { blackList: "" });
    await expect(async () => {
      await page.keyboard.down("Space");
      try {
        await expect(page.locator(".hint").first()).toBeVisible({
          timeout: 500,
        });
      } finally {
        await page.keyboard.up("Space");
      }
    }).toPass({ timeout: 10_000 });
  });

  test("blacklist is matched again after an in-page navigation", async ({
    baseURL,
    context,
    page,
  }) => {
    const pushed = new URL("input.html?pushed", baseURL).href;
    await gotoTest(page, "input.html");
    await setSettings(context, { blackList: pushed });
    // WHY: let content-all's debounced reload run at the original URL, so only the navigation can make the blacklist match.
    await page.waitForTimeout(600);
    await page.evaluate(() => history.pushState(null, "", "?pushed"));
    // WHY: the blacklist is re-read asynchronously after `navigatesuccess`; a Space pressed before that finishes would still start hinting.
    await page.waitForTimeout(500);

    await page.keyboard.down("Space");
    // WHY: absence cannot be awaited; hints render well within this time when not blacklisted.
    await page.waitForTimeout(1_000);
    await expect(page.locator(".hint")).toHaveCount(0);
    await page.keyboard.up("Space");

    await page.evaluate(() => history.pushState(null, "", "input.html"));
    await expect(async () => {
      await page.keyboard.down("Space");
      try {
        await expect(page.locator(".hint").first()).toBeVisible({
          timeout: 500,
        });
      } finally {
        await page.keyboard.press(CANCEL_KEY);
        await page.keyboard.up("Space");
      }
    }).toPass({ timeout: 10_000 });
  });

  test("switching the storage area updates hint letters in both content scripts", async ({
    context,
    page,
  }) => {
    await setSettings(context, { cancelKey: CANCEL_KEY });
    const syncLetters = (await getSettings(context)).hints;
    const localLetters = "qwertyuiop";
    // WHY: fill every key in local so that no back-fill write accompanies the switch and `_area` is the only change.
    await setSettings(
      context,
      { ...(await getSettings(context)), hints: localLetters },
      "local",
    );
    await gotoTest(page, "input.html");

    await setSettings(context, { _area: "chrome-local" }, "local");
    await expectHintLetters(page, localLetters);

    await setSettings(context, { _area: "chrome-sync" }, "local");
    await expectHintLetters(page, syncLetters);
  });
});

test.describe("settings missing from storage", () => {
  test("hints get the default CSS before it is back-filled", async ({
    context,
    page,
  }) => {
    await context.serviceWorkers()[0].evaluate(async () => {
      interface SW {
        chrome: { storage: { sync: { remove(k: string): Promise<void> } } };
      }
      await (globalThis as unknown as SW).chrome.storage.sync.remove("css");
    });
    await gotoTest(page, "input.html");
    await attachHints(page);
    await expect(page.locator("#overlay").first()).toHaveCSS(
      "background-color",
      "rgb(153, 153, 153)",
    );
    await page.keyboard.up("Space");
  });
});
