import { expect, test, type Page } from "@playwright/test";
import { createClient } from "../integration/client";
import { admin, s3Fixture, testUsers } from "../integration/config";
import { allowOrigin, APP_ORIGIN, bareBucket, E2E_BUCKET } from "./fixture";
import { axeViolations, collectErrors, connectCustom, fillCustomForm, layoutFor } from "./helpers";

// FR-1 to FR-7, FR-110 end to end, against the S3 fixture and the production build under its real CSP.
const sdk = createClient(admin);

/** Emulates a provider whose bucket list answers CORS preflights, which the fixture's service-level call does not. */
async function allowBucketList(page: Page): Promise<void> {
  const cors = {
    "access-control-allow-origin": APP_ORIGIN,
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, HEAD",
    "access-control-expose-headers": "ETag, Date, x-amz-bucket-region",
  };
  const root = new URL(s3Fixture.endpoint);
  await page.route((url) => url.origin === root.origin && url.pathname === "/", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
  });
}

const noOverflow = async (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("connecting a bucket", () => {
  test("AC-1.1, AC-5.2: Welcome, a custom endpoint, the six checks, then an empty Files screen", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Manage your bucket files the way you already manage files" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Explore with sample files" })).toHaveCount(0);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);

    await connectCustom(page);
    const checks = page.getByRole("list", { name: "Connection checks" });
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(checks.getByRole("listitem")).toHaveCount(6);
    await expect(checks.getByText(/^Passed/)).toHaveCount(6);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Open bucket" }).click();
    await expect(page).toHaveURL(/#\/files$/);
    await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("AC-6.1, AC-6.3: a bucket without CORS shows the exact origin, and Check again passes after the rule is added", async ({ page }) => {
    const bucket = await bareBucket(sdk);
    await page.goto("/");
    await connectCustom(page, { bucket });
    await expect(page.getByRole("heading", { level: 1, name: "Your bucket needs a CORS rule" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("code", { hasText: APP_ORIGIN })).toBeVisible();
    await expect(page.getByRole("tab", { name: "JSON" })).toHaveAttribute("aria-selected", "true");
    const json = await page.getByRole("tabpanel").locator("pre").innerText();
    expect(JSON.parse(json)).toEqual([expect.objectContaining({ AllowedOrigins: [APP_ORIGIN] })]);
    await page.getByRole("tab", { name: "XML" }).click();
    await expect(page.getByRole("tabpanel")).toContainText(`<AllowedOrigin>${APP_ORIGIN}</AllowedOrigin>`);
    await expect(page.getByText(/Don’t use \* as an allowed origin/)).toBeVisible();
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);

    await allowOrigin(sdk, bucket);
    await page.getByRole("button", { name: "I’ve added it · Check again" }).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Open bucket" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  });

  test("AC-110.1: a read-only key gets the offer, and Connect read-only continues", async ({ page }) => {
    await page.goto("/");
    await connectCustom(page, { ...testUsers.readOnly, bucket: E2E_BUCKET });
    await expect(page.getByText("This key can read but not write")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Edit keys" })).toBeVisible();
    await page.getByRole("button", { name: "Connect read-only" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  });

  test("AC-5.4: a wrong secret says the signature didn't match", async ({ page }) => {
    await page.goto("/");
    await connectCustom(page, { secretAccessKey: "coffer-wrong-secret-not-real" });
    await expect(page.getByText("The signature didn’t match")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Edit keys" }).first()).toBeVisible();
  });

  test("AC-5.3: an endpoint nobody answers on says it can't be reached and offers Edit endpoint", async ({ page }) => {
    await page.goto("/");
    await connectCustom(page, { endpoint: "http://127.0.0.1:9" });
    await expect(page.getByText("Can’t reach http://127.0.0.1:9")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Edit endpoint" }).click();
    await expect(page.getByLabel("Endpoint URL")).toHaveValue("http://127.0.0.1:9");
    await expect(page.getByLabel("Secret Access Key")).toHaveValue("");
  });

  test("AC-7.1: when the bucket list is reachable, the key's buckets are listed, searchable, and the chosen one is tested", async ({ page }) => {
    await allowBucketList(page);
    await page.goto("/");
    await connectCustom(page, { bucket: "" });
    await page.getByRole("button", { name: "Choose a bucket" }).click({ timeout: 30_000 });
    await expect(page.getByText(/This key can access \d+ buckets?\./)).toBeVisible();
    await page.getByRole("searchbox", { name: "Search buckets" }).fill(E2E_BUCKET);
    await page.getByRole("button", { name: E2E_BUCKET, exact: true }).click();
    await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  });

  test("AC-7.3, D-28: when the list is blocked, the person types the bucket name instead", async ({ page }) => {
    await page.goto("/");
    await connectCustom(page, { bucket: "" });
    await page.getByRole("button", { name: "Choose a bucket" }).click({ timeout: 30_000 });
    await expect(page.getByRole("searchbox", { name: "Search buckets" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Bucket name" }).fill(E2E_BUCKET);
    await page.getByRole("button", { name: "Open bucket" }).click();
    await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  });
});

test.describe("secrets stay in the browser's memory", () => {
  test("AC-4.4: paste fills the form and clears itself, and no secret reaches the DOM, URL, storage or network", async ({ page }) => {
    const secret = "coffer-test-secret-not-real";
    const seen: string[] = [];
    page.on("request", (request) => {
      seen.push(request.url(), request.postData() ?? "", ...Object.values(request.headers()));
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect a bucket" }).click();
    await page.getByRole("button", { name: "Other S3-compatible service" }).click();
    await page.getByText("Paste credentials").click();
    await page.getByLabel("Paste here").fill(`AWS_ACCESS_KEY_ID=${admin.accessKeyId}\nAWS_SECRET_ACCESS_KEY=${secret}\n`);
    await page.getByRole("button", { name: "Fill the form" }).click();
    await expect(page.getByLabel("Paste here")).toHaveValue("");
    await expect(page.getByText("detected")).toHaveCount(2);
    await expect(page.getByLabel("Secret Access Key")).toHaveValue(secret);
    await expect(page.getByLabel("Secret Access Key")).toHaveAttribute("type", "password");

    await page.getByLabel("Endpoint URL").fill("http://127.0.0.1:9000");
    await page.getByLabel("Bucket", { exact: true }).fill(E2E_BUCKET);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();

    const where = await page.evaluate(async () => ({
      html: document.documentElement.outerHTML,
      url: location.href,
      local: JSON.stringify(Object.entries(localStorage)),
      session: JSON.stringify(Object.entries(sessionStorage)),
      cookie: document.cookie,
      databases: JSON.stringify(await indexedDB.databases()),
    }));
    for (const [name, text] of Object.entries(where)) expect(text, name).not.toContain(secret);
    for (const text of seen) expect(text).not.toContain(secret);
  });
});

test.describe("keyboard", () => {
  test("the whole connect flow works with the keyboard alone", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Safari does not Tab to buttons by default");
    /** Tab until the focused control has this accessible name (label, text or aria-label). */
    async function tabTo(name: string | RegExp): Promise<void> {
      const visited: string[] = [];
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press("Tab");
        const label = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element) return "";
          const labelled = element.getAttribute("aria-label") ?? (element as HTMLInputElement).labels?.[0]?.textContent ?? element.textContent;
          return labelled.trim();
        });
        visited.push(label);
        if (typeof name === "string" ? label === name : name.test(label)) return;
      }
      throw new Error(`Tab never reached ${String(name)}; it stopped at: ${visited.slice(0, 6).join(" | ")}`);
    }
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible();
    await tabTo("Connect a bucket");
    await page.keyboard.press("Enter");
    // The provider list is a lazy chunk; the step takes focus itself once it shows.
    await expect(page.getByRole("heading", { name: "Choose your provider" })).toBeVisible();
    await tabTo("Search providers");
    await page.keyboard.type("other");
    await tabTo(/Other S3-compatible service$/);
    await page.keyboard.press("Enter");
    await tabTo("Endpoint URL");
    await page.keyboard.type("http://127.0.0.1:9000");
    await tabTo("Access Key ID");
    await page.keyboard.type(admin.accessKeyId);
    await tabTo("Secret Access Key");
    await page.keyboard.type(admin.secretAccessKey);
    await tabTo("Bucket");
    await page.keyboard.type(E2E_BUCKET);
    await tabTo("Connect");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Open bucket" })).toBeVisible({ timeout: 30_000 });
    await tabTo("Open bucket");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  });

  test("focus lands on the step heading after each step", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Connect a bucket" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Choose your provider" })).toBeFocused();
    await page.getByRole("button", { name: "Other S3-compatible service" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Connect Other S3-compatible/ })).toBeFocused();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility in ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("Welcome, providers, the form with errors, a CORS failure and success have no axe violations", async ({ page }) => {
      const bucket = await bareBucket(sdk);
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      await page.getByRole("button", { name: "Connect a bucket" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Choose your provider" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      await page.getByRole("button", { name: "Other S3-compatible service" }).click();
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await expect(page.getByText("Endpoint URL is required.")).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      await page.getByText("Advanced options").click();
      await page.getByText("Paste credentials").click();
      expect(await axeViolations(page)).toEqual([]);

      await fillCustomForm(page, { bucket });
      await expect(page.getByRole("heading", { level: 1, name: "Your bucket needs a CORS rule" })).toBeVisible({ timeout: 30_000 });
      expect(await axeViolations(page)).toEqual([]);

      await allowOrigin(sdk, bucket);
      await page.getByRole("button", { name: "I’ve added it · Check again" }).click();
      await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });
      expect(await axeViolations(page)).toEqual([]);
    });

    test("the read-only offer and the bucket picker have no axe violations", async ({ page }) => {
      await allowBucketList(page);
      await page.goto("/");
      await connectCustom(page, { ...testUsers.readOnly, bucket: E2E_BUCKET });
      await expect(page.getByText("This key can read but not write")).toBeVisible({ timeout: 30_000 });
      expect(await axeViolations(page)).toEqual([]);

      await page.getByRole("button", { name: "Edit keys" }).click();
      await page.getByLabel("Bucket", { exact: true }).fill("");
      await page.getByLabel("Access Key ID").fill(admin.accessKeyId);
      await page.getByLabel("Secret Access Key").fill(admin.secretAccessKey);
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await page.getByRole("button", { name: "Choose a bucket" }).click({ timeout: 30_000 });
      await expect(page.getByRole("heading", { level: 1, name: "Choose a bucket" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

test("controls on the onboarding screens are at least 44 px tall on mobile and 24 px elsewhere", async ({ page }, testInfo) => {
  const minimum = layoutFor(testInfo) === "compact" ? 44 : 24;
  async function check(): Promise<void> {
    const controls = page.locator("main button, main input:not([type=radio]), main select, main summary, main textarea");
    const count = await controls.count();
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      if (!(await control.isVisible())) continue;
      const box = await control.boundingBox();
      const name = (await control.getAttribute("aria-label")) ?? (await control.innerText().catch(() => ""));
      expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(minimum);
    }
  }
  await page.goto("/");
  await check();
  await page.getByRole("button", { name: "Connect a bucket" }).click();
  await check();
  await page.getByRole("button", { name: "Other S3-compatible service" }).click();
  await check();
});
