import { type Page } from "@playwright/test";
import { expect, expectConsole, PROVOKED_NETWORK_FAILURE, test } from "./test";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { allowOrigin, APP_ORIGIN } from "./fixture";
import { connectCustom } from "./helpers";

// OQ-35 / T-9: Chrome and Edge ask before a public page reaches localhost or the
// local network. Playwright's pages come from 127.0.0.1, which Chromium treats as
// loopback, so here the app is served under a fake public origin through
// page.route(); the S3 fixture stays on 127.0.0.1. Other engines have no such prompt.
const PUBLIC_ORIGIN = "https://coffer.test";
const BUCKET = "coffer-e2e-lna";

test.skip(({ browserName }) => browserName !== "chromium", "Local Network Access exists in Chrome and Edge only");
test.skip(({ viewport }) => viewport?.width !== 1440, "the width does not matter here");

test.beforeAll(async () => {
  const sdk = createClient(admin);
  try {
    await sdk.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch {
    // It exists from an earlier run.
  }
  await allowOrigin(sdk, BUCKET, PUBLIC_ORIGIN);
});

async function openPublicApp(page: Page): Promise<void> {
  await page.route(`${PUBLIC_ORIGIN}/**`, async (route) => {
    const { pathname, search } = new URL(route.request().url());
    const response = await route.fetch({ url: `${APP_ORIGIN}${pathname}${search}` });
    await route.fulfill({ response });
  });
  await page.goto(`${PUBLIC_ORIGIN}/`);
}

test("AC-5.1, T-9: a public page asks first, and only after Continue does the browser's own prompt happen", async ({ page }) => {
  await openPublicApp(page);
  // Nothing has touched the local network yet: opening the page must not trigger the browser prompt.
  expect(await page.evaluate(async () => (await navigator.permissions.query({ name: "loopback-network" as PermissionName })).state)).toBe("prompt");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await connectCustom(page, { bucket: BUCKET });
  await expect(page.getByText("Your browser will ask to reach your local network")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("http://127.0.0.1:9000 is on this device or your local network.")).toBeVisible();
  expect(requests.filter((url) => url.startsWith("http://127.0.0.1:9000"))).toEqual([]);
});

test("T-9: when the browser denies access, the screen says how to allow it instead of a generic network error", async ({ page }) => {
  // The denied loopback permission is logged as a CORS block.
  expectConsole(PROVOKED_NETWORK_FAILURE);
  await openPublicApp(page);
  await connectCustom(page, { bucket: BUCKET });
  await page.getByRole("button", { name: "Continue" }).click({ timeout: 30_000 });
  // Headless Chromium answers the browser prompt with "deny".
  await expect(page.getByText("Your browser blocked access to your local network")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/set Local network access to Allow/)).toBeVisible();
  await expect(page.getByText(/Can’t reach/)).toHaveCount(0);
});

test("T-9: with local network access granted the test runs without any pre-prompt", async ({ page, context }) => {
  await context.grantPermissions(["local-network-access"], { origin: PUBLIC_ORIGIN });
  await openPublicApp(page);
  await connectCustom(page, { bucket: BUCKET });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Your browser will ask to reach your local network")).toHaveCount(0);
});
