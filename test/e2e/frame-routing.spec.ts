import type { Locator, Page } from "@playwright/test";
import {
  test,
  expect,
  gotoTest,
  attachHints,
  findHintNear,
  setSettings,
} from "./fixtures";

/** Hit the hint on `button` and expect its onclick to run. */
async function hitButton(page: Page, button: Locator) {
  const box = await button.boundingBox();
  expect(box).toBeTruthy();
  await attachHints(page);
  const hint = await findHintNear(page, box!);
  for (const ch of hint) await page.keyboard.press(ch);
  await page.keyboard.up("Space");
  await expect(button).toHaveText("clicked", { timeout: 3_000 });
}

test.describe("hints in cross-origin iframes", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test("the top frame's button", async ({ page }) => {
    await gotoTest(page, "cross-origin-iframe.html");
    await hitButton(page, page.locator("#top-button"));
  });

  test("a button in a cross-origin iframe", async ({ page }) => {
    await gotoTest(page, "cross-origin-iframe.html");
    await hitButton(page, page.frameLocator("#child").locator("#child-button"));
  });

  test("a button in an iframe nested in a cross-origin iframe", async ({
    page,
  }) => {
    await gotoTest(page, "cross-origin-iframe.html");
    await hitButton(
      page,
      page.frameLocator("#child").frameLocator("iframe").locator("button"),
    );
  });
});

test.describe("hints in iframes inside shadow roots", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test("a button in a same-origin iframe", async ({ page }) => {
    await gotoTest(page, "shadow-iframe.html");
    await hitButton(
      page,
      page.locator("iframe >> nth=1").contentFrame().locator("button"),
    );
  });

  test("a button in a cross-origin iframe", async ({ page }) => {
    await gotoTest(page, "shadow-iframe.html");
    await hitButton(
      page,
      page.locator("iframe >> nth=0").contentFrame().locator("#child-button"),
    );
  });

  test("a button in an iframe nested in a cross-origin iframe", async ({
    page,
  }) => {
    await gotoTest(page, "shadow-iframe.html");
    await hitButton(
      page,
      page
        .locator("iframe >> nth=0")
        .contentFrame()
        .frameLocator("iframe")
        .locator("button"),
    );
  });
});

test.describe("blur in cross-origin and shadow-root iframes", () => {
  test.beforeEach(async ({ context }) => {
    await setSettings(context, { blurKey: "Escape" });
  });

  test.afterEach(async ({ context }) => {
    await setSettings(context, { blurKey: "" });
  });

  const cases: [string, string, (page: Page) => Locator][] = [
    [
      "cross-origin-iframe.html",
      "cross-origin iframe",
      (page) => page.frameLocator("#child").locator("#child-button"),
    ],
    [
      "cross-origin-iframe.html",
      "iframe nested in a cross-origin iframe",
      (page) =>
        page.frameLocator("#child").frameLocator("iframe").locator("button"),
    ],
    [
      "shadow-iframe.html",
      "cross-origin iframe in a shadow root",
      (page) =>
        page.locator("iframe >> nth=0").contentFrame().locator("#child-button"),
    ],
    [
      "shadow-iframe.html",
      "iframe nested in a cross-origin iframe in a shadow root",
      (page) =>
        page
          .locator("iframe >> nth=0")
          .contentFrame()
          .frameLocator("iframe")
          .locator("button"),
    ],
  ];
  for (const [file, name, button] of cases) {
    test(`blur key blurs a button in an ${name}`, async ({ page }) => {
      await gotoTest(page, file);
      const target = button(page);
      await target.click();
      await expect(target).toBeFocused();
      await target.press("Escape");
      await expect(target).not.toBeFocused({ timeout: 3_000 });
    });
  }
});

test.describe("page-visible messages", () => {
  // WHY: #146, GitHub's mermaid preview breaks on unexpected messages from child frames.
  test("a child frame never posts a message to its parent", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { received: unknown[] };
      w.received = [];
      window.addEventListener("message", (e) => w.received.push(e.data));
    });
    await gotoTest(page, "cross-origin-iframe.html");
    await hitButton(
      page,
      page.frameLocator("#child").frameLocator("iframe").locator("button"),
    );
    await page.keyboard.up("Space");
    expect(
      await page.evaluate(
        () => (window as unknown as { received: unknown[] }).received,
      ),
    ).toEqual([]);
  });
});

test.describe("hints in an iframe whose content script starts late", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  test("a button in a cross-origin iframe inserted as hinting begins", async ({
    page,
  }) => {
    /* WHY: an init script registers its listener before the extension's
       content script does, so the iframe is inserted before the extension
       handles the Space keydown. Its content script then starts after the
       SyncHintingState broadcast of the session. */
    await page.addInitScript(() => {
      window.addEventListener(
        "keydown",
        (e) => {
          if (e.code !== "Space" || document.querySelector("iframe")) return;
          const otherHost =
            location.hostname === "localhost" ? "127.0.0.1" : "localhost";
          const iframe = document.createElement("iframe");
          iframe.id = "child";
          iframe.style.cssText = "width: 500px; height: 200px";
          iframe.src = `${location.protocol}//${otherHost}:${location.port}/tests/cross-origin-iframe-child.html`;
          document.body.appendChild(iframe);
        },
        true,
      );
    });
    await gotoTest(page, "cross-origin-iframe-late.html");
    await expect(page.locator("#child")).toHaveCount(0);

    await page.keyboard.down("Space");
    const button = page.frameLocator("#child").locator("#child-button");
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).toBeTruthy();
    const hint = await findHintNear(page, box!);
    for (const ch of hint) await page.keyboard.press(ch);
    await page.keyboard.up("Space");
    await expect(button).toHaveText("clicked", { timeout: 3_000 });
  });
});
