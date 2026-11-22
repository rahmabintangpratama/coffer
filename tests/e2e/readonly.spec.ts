import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { axeViolations, enterReadOnlyApp, goToRoute, layoutFor, type Layout } from "./helpers";

// M9: the read-only experience (FR-110, FR-111; S41, S42): the chip and banner, and every write action off with its reason
// or gone, in menus, the selection bar, New and the FAB, the viewer and Trash. The key is the fixture's read-only user.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const REASON = "This key is read-only";
const unique = () => `e2e-ro/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const serious = (violations: Awaited<ReturnType<typeof axeViolations>>) => violations.filter((v) => v.impact === "serious" || v.impact === "critical");
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
const put = (key: string, body = "x") => s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: key, Body: body }));
const banner = (page: Page) => page.locator('[data-component="ReadOnlyBanner"]');

async function enterFolder(page: Page, folder: string): Promise<void> {
  await enterReadOnlyApp(page, `/files/${folder}`);
  await expect(row(page, "report.txt")).toBeVisible({ timeout: 15_000 });
}

async function openRowMenu(page: Page, layout: Layout, name: string) {
  await page.getByRole("button", { name: `More actions for ${name}` }).first().click();
  return layout === "compact" ? page.getByRole("dialog", { name }) : page.getByRole("menu");
}

test.describe("a read-only connection", () => {
  let folder = "";
  test.beforeEach(async () => {
    folder = unique();
    await put(`${folder}/report.txt`, "quarterly numbers");
    await put(`${folder}/sub/inner.txt`, "i");
  });

  test("AC-111.1 the app bar has the Read-only chip with its reason, and the banner says why and offers another key", async ({ page }) => {
    await enterFolder(page, folder);
    const chip = page.locator('[data-component="ReadOnlyBadge"]');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("Read-only");
    await expect(chip).toHaveAttribute("title", REASON);
    await expect(banner(page)).toContainText(REASON);
    await expect(banner(page)).toContainText("You can browse, preview and download. To change files, connect with a key that has write access.");
    expect(serious(await axeViolations(page))).toEqual([]);

    // Use another key starts Add connection over this session, and going back returns to it.
    await banner(page).getByRole("button", { name: "Use another key" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Choose your provider" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(row(page, "report.txt")).toBeVisible();
  });

  test("AC-111.2 New and the FAB are not there, and a file cannot be dropped to upload", async ({ page }) => {
    await enterFolder(page, folder);
    await expect(page.getByRole("button", { name: "New" })).toHaveCount(0);
    await expect(page.locator('[data-component="NewMenuButton"]')).toHaveCount(0);
    await expect(page.getByTestId("upload-files-input")).toHaveCount(0);
  });

  test("S42 AC-111.2 the row menu disables Rename, Make a copy, Move and Move to trash, each with the reason, and keeps the rest", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    await enterFolder(page, folder);
    const menu = await openRowMenu(page, layout, "report.txt");
    const item = (name: RegExp) => (layout === "compact" ? menu.getByRole("button", { name }) : menu.getByRole("menuitem", { name }));
    for (const name of [/^Rename/, /^Make a copy/, /^Move…/, /^Move to trash/]) {
      const target = item(name);
      await expect(target).toBeVisible();
      if (layout === "compact") await expect(target).toBeDisabled();
      else await expect(target).toHaveAttribute("aria-disabled", "true");
      await expect(target).toContainText(REASON);
    }
    for (const name of [/^Preview/, /^Download/, /^Share link/, /^Details/, /^Copy key/]) {
      const target = item(name);
      await expect(target).toBeVisible();
      if (layout === "compact") await expect(target).toBeEnabled();
      else await expect(target).not.toHaveAttribute("aria-disabled", "true");
    }
    expect(serious(await axeViolations(page))).toEqual([]);
  });

  test("a folder's menu and the current folder's menu are off the same way", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    await enterFolder(page, folder);
    const menu = await openRowMenu(page, layout, "sub");
    const item = (name: RegExp) => (layout === "compact" ? menu.getByRole("button", { name }) : menu.getByRole("menuitem", { name }));
    for (const name of [/^Rename/, /^Move…/, /^Move to trash/]) await expect(item(name)).toContainText(REASON);
    await page.keyboard.press("Escape");
    // The folder menu beside the breadcrumb: New folder is there, off, with the reason.
    await page.getByRole("button", { name: /Actions for this folder/ }).click();
    const folderMenu = layout === "compact" ? page.getByRole("dialog").last() : page.getByRole("menu");
    const newFolder = layout === "compact" ? folderMenu.getByRole("button", { name: /^New folder/ }) : folderMenu.getByRole("menuitem", { name: /^New folder/ });
    await expect(newFolder).toContainText(REASON);
    if (layout === "compact") await expect(newFolder).toBeDisabled();
    else await expect(newFolder).toHaveAttribute("aria-disabled", "true");
  });

  test("AC-111.3 the selection bar drops Move and Move to trash and keeps Download and Share link", async ({ page }, testInfo) => {
    test.skip(layoutFor(testInfo) === "compact", "Touch selection is a long press; the bar's actions are covered by the component test.");
    await enterFolder(page, folder);
    await row(page, "report.txt").click();
    const bar = page.getByRole("toolbar", { name: "Selection actions" });
    await expect(bar.getByRole("button", { name: "Download" })).toBeEnabled();
    await expect(bar.getByRole("button", { name: "Share link" })).toBeEnabled();
    await expect(bar.getByRole("button", { name: /Move/ })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: /trash/i })).toHaveCount(0);
  });

  test("the viewer keeps Download, Share link and Details, and has no write action", async ({ page }) => {
    await enterFolder(page, folder);
    await row(page, "report.txt").focus();
    await page.keyboard.press("Enter");
    const viewer = page.locator('dialog[data-component="Preview"]');
    await expect(viewer).toBeVisible();
    for (const name of ["Download", "Share link", "Details"]) await expect(viewer.getByRole("button", { name })).toBeEnabled();
    await expect(viewer.getByRole("button", { name: /Rename|Move|trash|Make a copy|Delete/i })).toHaveCount(0);
    await viewer.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: /Rename|Move|trash|Make a copy|Delete/i })).toHaveCount(0);
  });

  test("S41 the Trash view shows the reason, and Empty trash, Restore and Delete forever are off", async ({ page }) => {
    const name = `ro-${Date.now().toString(36)}.txt`;
    await put(`.coffer-trash/20261122T090503Z-roview/${name}`, "old");
    await enterReadOnlyApp(page, "/trash");
    const item = page.locator('[data-component="TrashRow"]').filter({ hasText: name });
    await expect(item).toBeVisible({ timeout: 15_000 });
    await expect(banner(page)).toContainText(REASON);
    await expect(banner(page).getByRole("button", { name: "Use another key" })).toBeVisible();
    const empty = page.getByRole("button", { name: "Empty trash" });
    await expect(empty).toBeDisabled();
    await expect(empty).toHaveAccessibleDescription(REASON);
    await item.getByRole("checkbox").check();
    for (const label of ["Restore", "Delete forever"]) {
      const button = page.getByRole("button", { name: label });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription(REASON);
    }
    expect(serious(await axeViolations(page))).toEqual([]);
  });

  test("an ordinary connection shows none of this", async ({ page }) => {
    // Sanity check on the other side: the same screens with a read-write key have no chip and no banner.
    const { enterApp } = await import("./helpers");
    await enterApp(page, "/files");
    await expect(page.locator('[data-component="ReadOnlyBadge"]')).toHaveCount(0);
    await expect(banner(page)).toHaveCount(0);
    await goToRoute(page, "/trash");
    await expect(banner(page)).toHaveCount(0);
  });
});
