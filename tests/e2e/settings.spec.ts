import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin, s3Fixture } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { axeViolations, enterApp, fillCustomForm, goToRoute, layoutFor, openBucket } from "./helpers";
import { temporaryCredentials } from "../integration/sts";

// M9: Settings pages and their persistence (FR-100, AC-100.1 to AC-100.3), and the demo that is not in the MVP (FR-120).
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const PASS = "correct horse battery staple";
const serious = (violations: Awaited<ReturnType<typeof axeViolations>>) => violations.filter((v) => v.impact === "serious" || v.impact === "critical");
const pages = [
  { name: "Appearance", path: "appearance" },
  { name: "Behavior", path: "behavior" },
  { name: "Connections", path: "connections" },
  { name: "Security", path: "security" },
  { name: "About", path: "about" },
] as const;

async function unlock(page: Page): Promise<void> {
  await page.getByLabel("Passphrase").fill(PASS);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
}

test.describe("the pages (AC-100.1)", () => {
  test("below 768 px a list opens detail pages with a way back; from 768 px a section nav sits beside the page", async ({ page }, testInfo) => {
    const compact = layoutFor(testInfo) === "compact";
    await enterApp(page, "/settings");
    if (compact) {
      const list = page.getByRole("list", { name: "Settings sections" });
      await expect(list.getByRole("link")).toHaveCount(5);
      expect(serious(await axeViolations(page))).toEqual([]);
      for (const entry of pages) {
        await list.getByRole("link", { name: new RegExp(`^${entry.name}`) }).click();
        await expect(page.getByRole("heading", { level: 2, name: entry.name })).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`#/settings/${entry.path}$`));
        await page.getByRole("link", { name: "Back to Settings" }).click();
        await expect(list).toBeVisible();
      }
    } else {
      const nav = page.getByRole("navigation", { name: "Settings sections" });
      await expect(nav.getByRole("link")).toHaveCount(5);
      // The bare address shows Security (S50).
      await expect(nav.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
      for (const entry of pages) {
        await nav.getByRole("link", { name: entry.name }).click();
        await expect(page.getByRole("heading", { level: 2, name: entry.name })).toBeVisible();
        await expect(nav.getByRole("link", { name: entry.name })).toHaveAttribute("aria-current", "page");
      }
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`every page passes axe in ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await enterApp(page, "/settings/appearance", { passphrase: PASS });
      for (const entry of pages) {
        await goToRoute(page, `/settings/${entry.path}`);
        await expect(page.getByRole("heading", { level: 2, name: entry.name })).toBeVisible();
        expect(serious(await axeViolations(page)), entry.name).toEqual([]);
      }
    });
  }

  test("the pages work from the keyboard: a link opens a page, arrows move through a radio group, Space toggles a switch", async ({ page }, testInfo) => {
    await enterApp(page, "/settings");
    if (layoutFor(testInfo) === "compact") {
      await page.getByRole("link", { name: /^Appearance/ }).focus();
      await page.keyboard.press("Enter");
    } else {
      await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Appearance" }).focus();
      await page.keyboard.press("Enter");
    }
    await expect(page.getByRole("heading", { level: 2, name: "Appearance" })).toBeVisible();
    await page.getByRole("radio", { name: "System" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
    await goToRoute(page, "/settings/behavior");
    const confirm = page.getByRole("checkbox", { name: /Ask before moving to trash/ });
    await confirm.focus();
    await page.keyboard.press("Space");
    await expect(confirm).toBeChecked();
  });
});

test.describe("settings persist (AC-100.2)", () => {
  test("theme, density, behavior and auto-lock survive a reload", async ({ page }) => {
    await enterApp(page, "/settings/appearance", { passphrase: PASS });
    await page.getByRole("radio", { name: "Dark" }).check();
    await page.getByRole("radio", { name: "Compact" }).check();
    await goToRoute(page, "/settings/behavior");
    await page.getByRole("checkbox", { name: /Ask before moving to trash/ }).check();
    await page.getByRole("checkbox", { name: /Show hidden files/ }).check();
    await page.getByLabel("Parallel upload parts").selectOption("6");
    await goToRoute(page, "/settings/security");
    await page.getByRole("radio", { name: "30 minutes", exact: true }).check();

    await page.reload();
    // The theme is on the page before anything else loads (the first paint), even while the app is locked.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { level: 1, name: "Unlock your connections" })).toBeVisible();
    await unlock(page);

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await goToRoute(page, "/settings/appearance");
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Compact" })).toBeChecked();
    await goToRoute(page, "/settings/behavior");
    await expect(page.getByRole("checkbox", { name: /Ask before moving to trash/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Show hidden files/ })).toBeChecked();
    await expect(page.getByLabel("Parallel upload parts")).toHaveValue("6");
    await goToRoute(page, "/settings/security");
    await expect(page.getByRole("radio", { name: "30 minutes", exact: true })).toBeChecked();
  });

  test("System follows the page's colour scheme live, and Light and Dark override it", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await enterApp(page, "/settings/appearance");
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radio", { name: "Light" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("the settings do what they say", () => {
  test("Show hidden files shows names that start with a dot", async ({ page }) => {
    const folder = `e2e-settings/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/visible.txt`, Body: "v" }));
    await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/.hidden.txt`, Body: "h" }));
    await enterApp(page, `/files/${folder}`);
    const row = (name: string) => page.locator('[data-component="FileRow"], [data-component="FileTile"]').filter({ hasText: name });
    await expect(row("visible.txt")).toBeVisible({ timeout: 15_000 });
    await expect(row(".hidden.txt")).toHaveCount(0);
    await goToRoute(page, "/settings/behavior");
    await page.getByRole("checkbox", { name: /Show hidden files/ }).check();
    await goToRoute(page, `/files/${folder}`);
    await expect(row(".hidden.txt")).toBeVisible({ timeout: 15_000 });
  });

  test("Ask before moving to trash puts a question in front of Move to trash", async ({ page }, testInfo) => {
    const folder = `e2e-settings/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/ask.txt`, Body: "a" }));
    await enterApp(page, "/settings/behavior");
    await page.getByRole("checkbox", { name: /Ask before moving to trash/ }).check();
    await goToRoute(page, `/files/${folder}`);
    await expect(page.locator('[data-component="FileRow"], [data-component="FileTile"]').filter({ hasText: "ask.txt" }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "More actions for ask.txt" }).first().click();
    if (layoutFor(testInfo) === "compact") await page.getByRole("dialog").getByRole("button", { name: /^Move to trash/ }).click();
    else await page.getByRole("menuitem", { name: /^Move to trash/ }).click();
    await expect(page.getByRole("dialog", { name: "Move to trash?" })).toBeVisible();
  });
});

test.describe("About (AC-100.3)", () => {
  test("shows the version, the origin, the MIT text and the IBM Plex credit", async ({ page }) => {
    await enterApp(page, "/settings/about");
    await expect(page.getByText(/^Coffer \d+\.\d+\.\d+/)).toBeVisible();
    await expect(page.getByText("http://127.0.0.1:4173")).toBeVisible();
    // M11: a link to the source, and the license text closed until asked for.
    const source = page.getByRole("link", { name: "github.com/rahmabintangpratama/coffer" });
    await expect(source).toHaveAttribute("href", "https://github.com/rahmabintangpratama/coffer");
    await expect(source).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByText(/Permission is hereby granted, free of charge/)).toBeHidden();
    await page.getByText("View license (MIT)").click();
    await expect(page.getByText(/Permission is hereby granted, free of charge/)).toBeVisible();
    await expect(page.getByText("IBM Plex Sans and Mono, licensed under the SIL Open Font License.")).toBeVisible();
  });
});

test("FR-120 Explore with sample files is not rendered: the demo is not in the MVP", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible();
  await expect(page.getByText(/Explore with sample files/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /sample files|demo/i })).toHaveCount(0);
});

test.describe("M11 Settings → Connections", () => {
  test("Test connection passes on the fixture; Add connection opens onboarding", async ({ page }) => {
    await enterApp(page, "/settings/connections", { passphrase: PASS });
    const list = page.getByRole("list", { name: "Connections" });
    await expect(list.getByText(/· Encrypted with your passphrase$/)).toBeVisible();
    await list.getByRole("button", { name: /^Test connection: / }).click();
    const test = page.getByRole("dialog", { name: /^Test / });
    await expect(test.getByText("Connection works")).toBeVisible({ timeout: 30_000 });
    expect(await axeViolations(page)).toEqual([]);
    await test.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: "Add connection" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/provider/i, { timeout: 10_000 });
  });

  test("AC-11.6 Edit connection saves only after a passing test, keeps unchanged keys, and replaces on a new start folder", async ({ page }) => {
    test.setTimeout(90_000);
    const folder = `e2e-edit/${Date.now().toString(36)}`;
    await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/inside.txt`, Body: "x" }));
    await enterApp(page, "/settings/connections", { passphrase: PASS });
    const list = page.getByRole("list", { name: "Connections" });
    const openEdit = async () => {
      await list.getByRole("button", { name: /^Edit: / }).click();
      await expect(page.getByRole("heading", { level: 1, name: /^Edit / })).toBeVisible({ timeout: 10_000 });
    };

    // A wrong secret fails the test, and cancelling leaves the saved connection as it was.
    await openEdit();
    await expect(page.getByLabel("Secret Access Key")).toHaveValue("");
    await expect(page.getByLabel("Bucket", { exact: true })).toHaveValue(E2E_BUCKET);
    expect(serious(await axeViolations(page))).toEqual([]);
    await page.getByLabel("Name", { exact: true }).fill("Never saved");
    await page.getByLabel("Secret Access Key").fill("coffer-wrong-secret-not-real");
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("The signature didn’t match")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(list.getByText("Never saved")).toHaveCount(0);

    // Same destination: a new name, the keys left empty.
    await openEdit();
    await page.getByLabel("Name", { exact: true }).fill("Team files");
    await page.getByRole("button", { name: "Test connection" }).click();
    await page.getByRole("button", { name: "Save changes" }).click({ timeout: 30_000 });
    await expect(list.getByText("Team files", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(list.getByRole("listitem")).toHaveCount(1);

    // A new start folder is a new destination: it asks, then replaces the old record.
    await openEdit();
    await page.getByText("Advanced options").click();
    await page.getByLabel("Start in folder").fill(folder);
    await page.getByRole("button", { name: "Test connection" }).click();
    await page.getByRole("button", { name: "Save changes" }).click({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Point to a different place?" })).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(list.getByText("Team files", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(list.getByRole("listitem")).toHaveCount(1);

    // The new record is what a fresh session opens, with the keys that were never typed again.
    await page.reload();
    await unlock(page);
    await goToRoute(page, "/files");
    await expect(page.getByText("inside.txt").first()).toBeVisible({ timeout: 15_000 });
  });

  test("AC-11.6 a new endpoint host gets none of the saved keys: they are typed again", async ({ page }) => {
    test.setTimeout(90_000);
    const temporary = await temporaryCredentials();
    await page.goto("/");
    await page.getByRole("button", { name: "Connect a bucket" }).click();
    await page.getByRole("button", { name: "Other S3-compatible service" }).click();
    await page.getByText("Advanced options").click();
    await page.getByLabel("Session token").fill(temporary.sessionToken);
    await fillCustomForm(page, temporary);
    await openBucket(page, PASS);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await goToRoute(page, "/settings/connections");

    // The same fixture under another host name stands for another server.
    const otherHost = s3Fixture.endpoint.replace("127.0.0.1", "localhost");
    const sent: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(otherHost)) return;
      sent.push(`${request.url()} ${JSON.stringify(request.headers())}`);
    });
    await page.getByRole("list", { name: "Connections" }).getByRole("button", { name: /^Edit: / }).click();
    await page.getByLabel("Endpoint URL").fill(otherHost);
    await expect(page.getByText(/the saved keys are not sent there/)).toBeVisible();
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Access Key ID is required.")).toBeVisible();
    expect(sent).toEqual([]);

    // Static keys: the session token stays empty.
    await page.getByLabel("Access Key ID").fill(admin.accessKeyId);
    await page.getByLabel("Secret Access Key").fill(admin.secretAccessKey);
    await page.getByRole("button", { name: "Test connection" }).click();
    await page.getByRole("button", { name: "Save changes" }).click({ timeout: 30_000 });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("list", { name: "Connections" })).toBeVisible({ timeout: 15_000 });
    expect(sent.length).toBeGreaterThan(0);
    for (const request of sent) {
      expect(request).not.toContain(temporary.accessKeyId);
      expect(request).not.toContain(temporary.sessionToken);
      expect(request.toLowerCase()).not.toContain("x-amz-security-token");
    }
  });
});

