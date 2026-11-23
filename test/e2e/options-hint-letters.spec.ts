import { test, expect, getSettings } from "./fixtures";

test("options page does not save invalid Hint Letters", async ({
  context,
  page,
}) => {
  const extensionId = new URL(context.serviceWorkers()[0].url()).host;
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const hints = page.locator('input[name="hints"]');
  const initial = (await getSettings(context)).hints;
  expect(initial).toBe(await hints.inputValue());

  // Each invalid value must leave the last saved value in storage.
  for (const invalid of ["", "a", "aa"]) {
    await hints.fill(invalid);
    await expect(page.locator("#key-conflicts")).toBeVisible();
    expect((await getSettings(context)).hints).toBe(initial);
  }

  await hints.fill("qwer");
  await expect(page.locator("#key-conflicts")).toBeHidden();
  await expect
    .poll(async () => (await getSettings(context)).hints)
    .toBe("qwer");
});
