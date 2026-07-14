import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, "test/e2e"),
  fullyParallel: false,
  timeout: 30_000,
  // WHY: retries absorb two known CI-only races (iframe-hint readiness fixed by gotoTest's wait; iframe-blur-cycle's async blur chain can still race input, see #95/#110) without weakening assertions.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:8787/tests/",
    // WHY: extension tests require a persistent context, set up per fixture.
  },
  projects: [
    {
      name: "chromium-extension",
      use: {
        // WHY: channel / headless config is handled in fixtures.ts launchPersistentContext.
      },
    },
  ],
  webServer: {
    command: "npx http-server docs -p 8787 -c-1 -d=false",
    url: "http://127.0.0.1:8787/",
    reuseExistingServer: !process.env.CI,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
