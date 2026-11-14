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
    const seen = await sw.evaluate(
      () => (globalThis as unknown as { __seen: string[] }).__seen,
    );
    // WHY: rect-aggregator fetches its frame id on startup, which is outside the settings reads this test covers.
    expect(seen.filter((t) => t !== "GetFrameId")).toEqual([]);
  });

  test("blacklist changes take effect without reloading", async ({
    baseURL,
    context,
    page,
  }) => {
    const url = new URL("input.html", baseURL).href;
    await setSettings(context, { blackList: url });
    await gotoTest(page, "input.html");
    await page.keyboard.down("Space");
    await expect(page.locator(".hint")).toHaveCount(0, { timeout: 1_000 });
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
