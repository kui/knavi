import { test, expect, gotoTest, setSettings, attachHints } from "./fixtures";

const READ_MESSAGES = ["GetSettings", "MatchBlacklist"];

test.describe("settings read directly from storage", () => {
  test("loading a page sends no settings or blacklist message to the background", async ({
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
    await attachHints(page);
    await page.keyboard.up("Space");
    const seen = await sw.evaluate(
      () => (globalThis as unknown as { __seen: string[] }).__seen,
    );
    expect(seen.filter((t) => READ_MESSAGES.includes(t))).toEqual([]);
  });

  test("blacklist changes take effect without reloading", async ({
    context,
    page,
  }) => {
    await gotoTest(page, "input.html");
    await attachHints(page);
    await page.keyboard.up("Space");
    await expect(page.locator(".hint")).toHaveCount(0);

    await setSettings(context, { blackList: page.url() + "\n" });
    // WHY: content-all re-reads settings after a 200 ms debounce.
    await page.waitForTimeout(600);
    await page.keyboard.down("Space");
    await page.waitForTimeout(500);
    await expect(page.locator(".hint")).toHaveCount(0);
    await page.keyboard.up("Space");

    await setSettings(context, { blackList: "" });
    await page.waitForTimeout(600);
    await attachHints(page);
    await page.keyboard.up("Space");
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
