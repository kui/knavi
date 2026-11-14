import { test, expect, gotoTest, setSettings, attachHints } from "./fixtures";

test.describe("settings read directly from storage", () => {
  test("loading a page sends no runtime message except GetFrameId", async ({
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
    await gotoTest(page, "input.html");
    const readSeen = () =>
      sw.evaluate(() => (globalThis as unknown as { __seen: string[] }).__seen);
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
    await page.reload();
    await gotoTest(page, "input.html");
    await page.keyboard.down("Space");
    // WHY: absence cannot be awaited; hints render well within this time when not blacklisted.
    await page.waitForTimeout(1_000);
    await expect(page.locator(".hint")).toHaveCount(0);
    await page.keyboard.up("Space");

    await setSettings(context, { blackList: "" });
    await expect(async () => {
      await page.keyboard.down("Space");
      await expect(page.locator(".hint").first()).toBeVisible({
        timeout: 500,
      });
    }).toPass({ timeout: 10_000 });
    await page.keyboard.up("Space");
  });

  test("switching the storage area updates hint letters in both content scripts", async ({
    context,
    page,
  }) => {
    const letters = "qwertyuiop";
    await setSettings(context, { hints: letters }, "local");
    await gotoTest(page, "input.html");
    await setSettings(context, { _area: "chrome-local" }, "local");

    await expect(async () => {
      await page.keyboard.down("Space");
      /* WHY: content-all defers reloading settings while hinting, so release
         Space after every attempt to let the pending reload run. */
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
        await page.keyboard.up("Space");
      }
    }).toPass({ timeout: 10_000 });
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
