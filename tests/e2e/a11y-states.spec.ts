import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { createClient } from "../integration/client";
import { admin, testUsers } from "../integration/config";
import { APP_ORIGIN, bareBucket, E2E_BUCKET } from "./fixture";
import { allowBucketList, axeViolations, connectCustom, enterApp, enterReadOnlyApp, goToRoute, layoutFor, type Layout } from "./helpers";
import { expect, PROVOKED_NETWORK_FAILURE, test } from "./test";

// M10: axe on every screen and state, in both themes, at every width and in every engine the matrix runs (NFR-5, NFR-6).
// Each test walks one session through its states; every state is checked in light and then in dark, and every failure is
// collected, so one run names them all. Serious and critical violations fail (the project rule in AGENTS.md).
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const PASS = "correct horse battery staple";
const unique = () => `e2e-a11y/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();

/** Runs axe in light, then dark, on whatever is on screen, and records what it found under `label`. */
async function check(page: Page, label: string, failures: string[]): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    // Theme System follows the page's colour scheme; wait for it, so the colours measured are the ones for this theme.
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(scheme);
    const found = (await axeViolations(page)).filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    if (found.length > 0) failures.push(`${label} (${scheme}): ${found.map((violation) => `${violation.rule} ${violation.nodes.join(" | ")}`).join("; ")}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function put(key: string, body = "x"): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: key, Body: body }));
}

async function menuOf(page: Page, layout: Layout, name: string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${name}` }).first().click();
  await expect(layout === "compact" ? page.getByRole("dialog") : page.getByRole("menu")).toBeVisible();
}
async function chooseItem(page: Page, layout: Layout, item: RegExp | string): Promise<void> {
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: item }).click();
  else await page.getByRole("menuitem", { name: item }).click();
}

test.describe("axe on every screen and state", () => {
  test("onboarding: Welcome, providers, the form empty, with errors, advanced and paste", async ({ page }) => {
    const failures: string[] = [];
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible();
    await check(page, "Welcome", failures);
    await page.getByRole("button", { name: "Connect a bucket" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Choose your provider" })).toBeVisible();
    await check(page, "Provider list", failures);
    await page.getByRole("button", { name: "Other S3-compatible service" }).click();
    await expect(page.getByLabel("Endpoint URL")).toBeVisible();
    await check(page, "Form, empty", failures);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByText("Endpoint URL is required.")).toBeVisible();
    await check(page, "Form, with errors", failures);
    await page.getByText("Advanced options").click();
    await page.getByText("Paste credentials").click();
    await check(page, "Form, advanced and paste open", failures);
    expect(failures).toEqual([]);
  });

  test.describe("screens reached through a provoked failure", () => {
    // A CORS block and a bucket list the fixture will not answer are the point of these screens; the browser logs them.
    test.use({ expectedConsole: PROVOKED_NETWORK_FAILURE });

    test("onboarding: the CORS help, a wrong secret, a missing bucket and the read-only offer", async ({ page }) => {
      test.setTimeout(90_000);
      const failures: string[] = [];
      await page.goto("/");
      await connectCustom(page, { bucket: await bareBucket(s3) });
      await expect(page.getByRole("heading", { level: 1, name: "Your bucket needs a CORS rule" })).toBeVisible({ timeout: 30_000 });
      await check(page, "CORS help", failures);

      await page.reload();
      await connectCustom(page, { secretAccessKey: "coffer-wrong-secret-not-real" });
      await expect(page.getByText("The signature didn’t match")).toBeVisible({ timeout: 30_000 });
      await check(page, "Wrong secret", failures);

      await page.reload();
      // A provider that has CORS on a missing bucket answers NoSuchBucket; the fixture has no rule there and would answer as CORS.
      const cors = { "access-control-allow-origin": APP_ORIGIN, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, PUT, POST, DELETE, HEAD", "access-control-expose-headers": "ETag, Date, x-amz-bucket-region" };
      await page.route((url) => url.pathname.startsWith("/coffer-no-such-bucket-a11y"), async (route) => {
        if (route.request().method() === "OPTIONS") {
          await route.fulfill({ status: 204, headers: cors });
          return;
        }
        await route.fulfill({ status: 404, headers: { ...cors, "content-type": "application/xml" }, body: '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>' });
      });
      await connectCustom(page, { bucket: "coffer-no-such-bucket-a11y" });
      await expect(page.getByText(/Bucket not found/)).toBeVisible({ timeout: 30_000 });
      await check(page, "Bucket not found", failures);

      await page.reload();
      await connectCustom(page, { ...testUsers.readOnly, bucket: E2E_BUCKET });
      await expect(page.getByText("This key can read but not write")).toBeVisible({ timeout: 30_000 });
      await check(page, "Read-only offer", failures);

      await page.reload();
      await allowBucketList(page);
      await connectCustom(page, { bucket: "" });
      await page.getByRole("button", { name: "Choose a bucket" }).click({ timeout: 30_000 });
      await expect(page.getByText(/This key can access \d+ buckets?\./)).toBeVisible();
      await check(page, "Pick a bucket", failures);
      expect(failures).toEqual([]);
    });
  });

  test("onboarding: Connected and Save on this device", async ({ page }) => {
    const failures: string[] = [];
    await page.goto("/");
    await connectCustom(page);
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });
    await check(page, "Connected", failures);
    await page.getByRole("button", { name: "Open bucket" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Save on this device?" })).toBeVisible();
    await check(page, "Save on this device", failures);
    await page.getByLabel("Passphrase").fill("short");
    await check(page, "Save on this device, passphrase too short", failures);
    expect(failures).toEqual([]);
  });

  test("a connected session: Files and every dialog, menu and sheet over it, then Trash, Settings, the switcher and the lock screens", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const layout = layoutFor(testInfo);
    const compact = layout === "compact";
    const folder = unique();
    await put(`${folder}/a.txt`, "alpha");
    await put(`${folder}/b.md`, "# beta");
    await put(`${folder}/sub/inner.txt`, "i");
    await put(`${folder}/empty/`, "");
    const failures: string[] = [];
    await enterApp(page, "/", { passphrase: PASS });

    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await check(page, "Home", failures);

    await goToRoute(page, `/files/${folder}`);
    await expect(row(page, "a.txt")).toBeVisible({ timeout: 15_000 });
    await check(page, "Files, list", failures);
    await page.getByRole("button", { name: "Grid layout" }).click();
    await expect(page.getByRole("button", { name: "Grid layout" })).toHaveAttribute("aria-pressed", "true");
    await check(page, "Files, grid", failures);
    await page.getByRole("button", { name: "List layout" }).click();

    await goToRoute(page, `/files/${folder}/empty`);
    await expect(page.getByRole("heading", { name: /This folder is empty|has no files yet/ })).toBeVisible({ timeout: 15_000 });
    await check(page, "Files, empty folder", failures);
    await goToRoute(page, `/files/${folder}`);
    await expect(row(page, "a.txt")).toBeVisible({ timeout: 15_000 });

    if (!compact) {
      await row(page, "a.txt").click();
      await expect(page.getByRole("toolbar", { name: "Selection actions" })).toBeVisible();
      await check(page, "Files, selection bar", failures);
      await page.keyboard.press("Escape");
    }

    await menuOf(page, layout, "a.txt");
    await check(page, "Row menu", failures);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "New" }).click();
    await expect(layout === "compact" ? page.getByRole("dialog") : page.getByRole("menu")).toBeVisible();
    await check(page, "New menu", failures);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Actions for this folder/ }).click();
    await expect(layout === "compact" ? page.getByRole("dialog") : page.getByRole("menu")).toBeVisible();
    await check(page, "Folder menu", failures);
    await page.keyboard.press("Escape");

    for (const [item, dialog] of [[/^Rename/, "Rename"], [/^Make a copy/, "Make a copy"]] as const) {
      await menuOf(page, layout, "a.txt");
      await chooseItem(page, layout, item);
      await expect(page.getByRole("dialog", { name: dialog })).toBeVisible();
      await check(page, `${dialog} dialog`, failures);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: dialog })).toHaveCount(0);
    }

    await menuOf(page, layout, "a.txt");
    await chooseItem(page, layout, /^Move…/);
    const move = page.getByRole("dialog", { name: "Move 1 item" });
    await expect(move.getByRole("treeitem", { name: /Current location/ })).toBeVisible({ timeout: 15_000 });
    await check(page, "Move dialog", failures);
    await page.keyboard.press("Escape");

    await menuOf(page, layout, "a.txt");
    await chooseItem(page, layout, /^Share link/);
    const share = page.getByRole("dialog", { name: "Share link" });
    await expect(share.getByRole("radio", { name: "1 day" })).toBeChecked();
    await check(page, "Share link, choose", failures);
    await share.getByRole("button", { name: /^Create link/ }).click();
    await expect(share.getByRole("textbox", { name: "Link" })).toBeVisible();
    await check(page, "Share link, created", failures);
    await share.getByRole("button", { name: "Done" }).click();

    await menuOf(page, layout, "a.txt");
    await chooseItem(page, layout, /^Details/);
    await expect(page.locator('[data-component="DetailsPanel"]')).toBeVisible();
    await check(page, "Details", failures);
    await page.keyboard.press("Escape");

    await row(page, "a.txt").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('dialog[data-component="Preview"]')).toBeVisible();
    await expect(page.locator('dialog[data-component="Preview"]').getByText("alpha")).toBeVisible({ timeout: 15_000 });
    await check(page, "Preview, text", failures);
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-component="Preview"]')).toHaveCount(0);

    await menuOf(page, layout, "b.md");
    await chooseItem(page, layout, /^Move to trash/);
    await expect(page.locator('[data-component="Toast"]').filter({ hasText: "Moved 1 item to trash" }).first()).toBeVisible();
    await check(page, "Toast", failures);

    await goToRoute(page, "/trash");
    await expect(page.locator('[data-component="TrashRow"]').filter({ hasText: `${folder}/b.md` })).toBeVisible({ timeout: 15_000 });
    await check(page, "Trash, with items", failures);
    await page.locator('[data-component="TrashRow"]').filter({ hasText: `${folder}/b.md` }).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Delete forever" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check(page, "Delete forever dialog", failures);
    await page.keyboard.press("Escape");

    for (const [path, name] of [["appearance", "Appearance"], ["behavior", "Behavior"], ["connections", "Connections"], ["security", "Security"], ["about", "About"]] as const) {
      await goToRoute(page, `/settings/${path}`);
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
      await check(page, `Settings, ${name}`, failures);
    }
    if (compact) {
      await goToRoute(page, "/settings");
      await expect(page.getByRole("list", { name: "Settings sections" })).toBeVisible();
      await check(page, "Settings, list", failures);
    }

    await goToRoute(page, "/settings/connections");
    await page.getByRole("button", { name: /^Show secret key:/ }).click();
    await expect(page.getByRole("dialog", { name: "Show secret key" })).toBeVisible();
    await check(page, "Show secret key dialog", failures);
    await page.keyboard.press("Escape");

    await goToRoute(page, "/settings/security");
    await page.getByRole("button", { name: "Forget", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Forget this device?" })).toBeVisible();
    await check(page, "Forget this device dialog", failures);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /^Switch connection:/ }).click();
    await expect(page.getByRole("dialog", { name: "Connections" })).toBeVisible();
    await check(page, "Connection switcher", failures);
    await page.getByRole("dialog", { name: "Connections" }).getByRole("button", { name: "Lock", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Lock Coffer now?" })).toBeVisible();
    await check(page, "Lock dialog", failures);
    await page.keyboard.press("Escape");

    if (compact) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("dialog", { name: "Main navigation" })).toBeVisible();
      await check(page, "Navigation drawer", failures);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "More" }).click();
      await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
      await check(page, "More sheet", failures);
      await page.keyboard.press("Escape");
    }

    await goToRoute(page, "/no-such-screen");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await check(page, "Not found", failures);

    await goToRoute(page, "/settings/security");
    await page.getByRole("button", { name: "Lock now" }).click();
    await page.getByRole("dialog", { name: "Lock Coffer now?" }).getByRole("button", { name: "Lock now" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Coffer is locked" })).toBeVisible();
    await check(page, "Locked", failures);
    await page.getByLabel("Passphrase").fill("not the passphrase");
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByText("That passphrase doesn’t match.")).toBeVisible();
    await check(page, "Locked, wrong passphrase", failures);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Unlock your connections" })).toBeVisible();
    await check(page, "Unlock", failures);
    await page.getByRole("button", { name: "Forget this device" }).click();
    await expect(page.getByRole("dialog", { name: "Forget this device?" })).toBeVisible();
    await check(page, "Unlock, Forget dialog", failures);
    expect(failures).toEqual([]);
  });

  test("a read-only connection: Files, the row menu, Trash, and the viewer", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const layout = layoutFor(testInfo);
    const folder = unique();
    await put(`${folder}/report.txt`, "numbers");
    const failures: string[] = [];
    await enterReadOnlyApp(page, `/files/${folder}`);
    await expect(row(page, "report.txt")).toBeVisible({ timeout: 15_000 });
    await check(page, "Read-only, Files", failures);
    await menuOf(page, layout, "report.txt");
    await check(page, "Read-only, row menu", failures);
    await page.keyboard.press("Escape");
    await row(page, "report.txt").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('dialog[data-component="Preview"]')).toBeVisible();
    await expect(page.locator('dialog[data-component="Preview"]').getByText("numbers")).toBeVisible({ timeout: 15_000 });
    await check(page, "Read-only, viewer", failures);
    await page.keyboard.press("Escape");
    await goToRoute(page, "/trash");
    await expect(page.getByRole("heading", { level: 1, name: "Trash" })).toBeVisible();
    await check(page, "Read-only, Trash", failures);
    expect(failures).toEqual([]);
  });
});
