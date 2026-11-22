import { networkInterfaces } from "node:os";
import { test, expect, gotoTest, attachHints } from "./fixtures";

function nonLoopbackAddress(): string | undefined {
  return Object.values(networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i.internal)?.address;
}

test.describe("non-secure origin", () => {
  test.afterEach(async ({ page }) => {
    await page.keyboard.up("Space").catch(() => void 0);
  });

  /* WHY: Chrome treats only localhost and loopback addresses as secure
     contexts. On other plain-http pages, APIs such as crypto.randomUUID are
     undefined in content scripts, and the other E2E tests (127.0.0.1) cannot
     see that. */
  test("hints work on a plain-http page that is not loopback", async ({
    page,
  }, testInfo) => {
    const address = nonLoopbackAddress();
    testInfo.skip(!address, "no non-loopback IPv4 address on this machine");

    await gotoTest(page, `http://${address}:8787/tests/input.html`);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);

    await attachHints(page);
  });
});
