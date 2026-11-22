import { defineConfig } from "@playwright/test";

// Lighthouse CI (technical-spec 14): the production build, served gzip-compressed with its real _headers, measured on a mobile
// profile. The build has no test switches, so the numbers are what a visitor gets. Chromium only: Lighthouse needs it.
const port = 4173;

export default defineConfig({
  testDir: "tests/lighthouse",
  // The fixture buckets allow the app origin http://127.0.0.1:4173, so the e2e setup is reused.
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `pnpm build && node scripts/serve/dist-server.ts --port ${port} --gzip`,
    url: `http://127.0.0.1:${port}`,
    // A server left over from an e2e run is not gzip and has test switches built in.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
