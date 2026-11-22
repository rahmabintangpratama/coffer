import { expect, type Page, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { enterApp } from "./helpers";

// D-40: the 120 KiB budget is the JavaScript transferred to render the first screen, on a cold load.
// Scripts are measured as gzip of what the server sent, for every script requested before the screen showed.
const KIB = 1024;
export const FIRST_SCREEN_BUDGET = 120 * KIB;

/**
 * With `idle` off the app never gets an idle moment, so only what the first screen needs is fetched and the
 * measurement cannot race with the prefetch that follows it.
 */
async function firstScreenScripts(page: Page, screen: () => Promise<void>, idle: boolean): Promise<{ gzip: number; files: string[] }> {
  if (!idle) await page.addInitScript(() => { window.requestIdleCallback = () => 0; });
  const requested: string[] = [];
  const bodies = new Map<string, Promise<number>>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!/\.m?js$/.test(url.pathname)) return;
    bodies.set(url.pathname, response.body().then((body) => gzipSync(body).length));
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\.m?js$/.test(url.pathname)) requested.push(url.pathname);
  });
  await page.goto("/");
  await screen();
  const first = new Set(requested);
  await page.waitForLoadState("networkidle");
  let gzip = 0;
  for (const path of first) gzip += (await bodies.get(path)) ?? 0;
  return { gzip, files: [...first] };
}

test.describe("D-40 first-screen JavaScript", () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== "chromium", "Transferred bytes are the same in every engine; one is enough.");
  });

  test("Welcome transfers at most 120 KiB of JavaScript, gzip", async ({ page }) => {
    const result = await firstScreenScripts(page, () => expect(page.getByRole("heading", { level: 1 })).toBeVisible(), false);
    test.info().annotations.push({ type: "welcome-gzip-kib", description: (result.gzip / KIB).toFixed(1) });
    expect(result.gzip, `Welcome loaded ${result.files.join(", ")}`).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET);
  });

  // D-43: a device with saved connections opens on Unlock, so the same budget holds for it. The saved connection is made
  // through the real screens in one context, and its storage (IndexedDB included) starts a second, cold one.
  test("Unlock transfers at most 120 KiB of JavaScript, gzip", async ({ browser }) => {
    const seed = await browser.newContext();
    await enterApp(await seed.newPage(), "/files", { passphrase: "correct horse battery staple" });
    const state = await seed.storageState({ indexedDB: true });
    await seed.close();
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    const result = await firstScreenScripts(page, () => expect(page.getByRole("heading", { level: 1, name: "Unlock your connections" })).toBeVisible(), false);
    await context.close();
    test.info().annotations.push({ type: "unlock-gzip-kib", description: (result.gzip / KIB).toFixed(1) });
    expect(result.gzip, `Unlock loaded ${result.files.join(", ")}`).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET);
  });

  test("the connect step is fetched while idle, so Connect a bucket still feels instant", async ({ page }) => {
    const seen: string[] = [];
    page.on("request", (request) => { seen.push(new URL(request.url()).pathname); });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The provider list and the S3 client are fetched without any click.
    await expect.poll(() => seen.some((path) => path.includes('/assets/s3-')) && seen.some((path) => path.includes('/assets/ConnectFlow-'))).toBe(true);
  });
});
