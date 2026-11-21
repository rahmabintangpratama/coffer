import { defineConfig, devices } from "@playwright/test";

// Layout is verified at the three design widths in two engines. Chromium covers
// Chrome and Edge; WebKit covers Safari (iOS Safari 16.4+ is mandatory).
const viewports = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;
const engines = [
  { name: "chromium", device: devices["Desktop Chrome"] },
  { name: "webkit", device: devices["Desktop Safari"] },
] as const;

const port = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: engines.flatMap((engine) =>
    viewports.map((viewport) => ({
      name: `${engine.name}-${viewport.name}`,
      use: { ...engine.device, viewport: { width: viewport.width, height: viewport.height } },
    })),
  ),
  webServer: {
    // Serves dist with its _headers, so every e2e test runs under the real CSP.
    command: `pnpm build && node scripts/serve/dist-server.ts --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
