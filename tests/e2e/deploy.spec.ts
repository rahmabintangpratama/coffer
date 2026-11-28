import { expect, test } from "./test";
import { checkLive } from "../../scripts/headers/check.ts";
import { collectErrors, connectCustom, cspViolations, goToRoute, openBucket, recordCspViolations } from "./helpers";

// ADR-010: a deployment served by another host, possibly under a path. Runs only under playwright.deploy.config.ts.
test.skip(({ baseURL }) => process.env.COFFER_DEPLOY_HOST === undefined || baseURL === undefined, "Runs against the generated nginx and Caddy configurations (pnpm test:deploy).");

const noHeaders = process.env.COFFER_DEPLOY_HOST === "github-pages";

test("headers:check passes against this server", async ({ baseURL }) => {
  test.skip(noHeaders, "This build is for a host that sends no headers.");
  expect(await checkLive(baseURL ?? "")).toEqual([]);
});

test("a missing asset is not cached for a year, and the header file is not served", async ({ request }) => {
  test.skip(noHeaders, "This build is for a host that sends no headers.");
  const missing = await request.get("assets/not-a-file-00000000.js");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["cache-control"]).toBeUndefined();
  expect(missing.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect((await request.get("_headers")).status()).toBe(404);
});

test("the app, its fonts, its icons and the PDF worker load from this path without a violation", async ({ page, baseURL }) => {
  const failed: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.port === "4173" && response.status() >= 400) failed.push(`${String(response.status())} ${url.pathname}`);
    if (url.port === "4173" && !url.pathname.startsWith(new URL(baseURL ?? "").pathname)) failed.push(`outside the base: ${url.pathname}`);
  });
  await recordCspViolations(page);
  const errors = collectErrors(page);
  await page.goto("./");
  // AC-1.4: under a path the first screen warns that the address is shared; at the root it says nothing.
  await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible();
  const underPath = new URL(baseURL ?? "").pathname !== "/";
  await expect(page.locator('[data-component="SharedOriginWarning"]')).toHaveCount(underPath ? 1 : 0);
  await connectCustom(page);
  await openBucket(page, "correct horse battery staple");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await goToRoute(page, "/files/preview");
  await page.locator('[data-component="FileRow"], [data-component="FileTile"]').filter({ hasText: ".pdf" }).first().dblclick();
  await expect(page.getByText(/^Page 1 of \d+$/)).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "IBM Plex Sans"'); })).toBe(true);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect((await page.request.get(manifest ?? "")).status()).toBe(200);
  expect(await cspViolations(page)).toEqual([]);
  // Unlock, after a reload, says the same.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Unlock your connections" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-component="SharedOriginWarning"]')).toHaveCount(underPath ? 1 : 0);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test.describe("a host that sends no headers", () => {
  test.use({ expectedConsole: /Content Security Policy|^script-src/ });

  test("the policy in the page still blocks an inline script", async ({ page }) => {
    test.skip(!noHeaders, "Where headers are sent, csp.spec.ts covers the policy.");
    const response = await page.goto("./");
    expect(response?.headers()["content-security-policy"]).toBeUndefined();
    await recordCspViolations(page);
    await page.reload();
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__inline = true";
      document.body.append(script);
    });
    await expect.poll(async () => (await cspViolations(page)).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __inline?: boolean }).__inline)).toBeUndefined();
  });
});
