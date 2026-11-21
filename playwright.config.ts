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
  // One retry in CI only. A test that needs it is reported as flaky in the run summary (scripts/ci/e2e-summary.ts), never hidden.
  retries: process.env.CI ? 1 : 0,
  // Each CI job runs one project; two workers keep a 4-core runner from being overloaded while the server and the S3 fixture run beside it.
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Blob reports are merged across the matrix jobs into one HTML report and one summary.
  reporter: process.env.CI ? [["github"], ["blob"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Kept for every failed attempt, so the first failure of a flaky test has a trace even though its retry passes.
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
    // The cap is lowered so the "Load all" cap message can be shown with a few thousand objects.
    command: `VITE_COFFER_LOAD_ALL_CAP=3000 pnpm build && node scripts/serve/dist-server.ts --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
