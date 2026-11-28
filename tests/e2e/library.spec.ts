import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { axeViolations, enterApp, goToRoute, layoutFor, type Layout } from "./helpers";

// M11: Starred (FR-80) and Recent (FR-81), local lists in this browser.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const unique = () => `e2e-lib/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
const toast = (page: Page) => page.locator('[data-component="Toast"]').last();
const put = (key: string) => s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: key, Body: "x" }));

async function chooseFromMenu(page: Page, layout: Layout, rowName: string, item: string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${rowName}` }).first().click();
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: item }).click();
  else await page.getByRole("menuitem", { name: item }).click();
}

let folder = "";
test.beforeEach(async ({ page }) => {
  folder = unique();
  await put(`${folder}/a.txt`);
  await put(`${folder}/b.txt`);
  await enterApp(page, "/files");
  await goToRoute(page, `/files/${folder}`);
  await expect(row(page, "a.txt")).toBeVisible({ timeout: 15_000 });
});

test("AC-80.1 and AC-80.3 starring from the menu lists the item with its folder; removing it shows the empty state", async ({ page }, testInfo) => {
  const layout = layoutFor(testInfo);
  await chooseFromMenu(page, layout, "a.txt", "Add to starred");
  await expect(toast(page)).toContainText("Added 1 item to starred");
  await goToRoute(page, "/starred");
  await expect(page.getByText("Saved in this browser. Starred items aren’t stored in your bucket.")).toBeVisible();
  const starred = page.locator('[data-component="StarredRow"]').filter({ hasText: "a.txt" });
  await expect(starred).toBeVisible();
  await expect(starred.getByText(`In ${E2E_BUCKET}/${folder}`)).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  // The location opens the folder.
  await starred.getByRole("link", { name: `In ${E2E_BUCKET}/${folder}` }).click();
  await expect(row(page, "b.txt")).toBeVisible({ timeout: 15_000 });
  // And the menu now offers Remove.
  await chooseFromMenu(page, layout, "a.txt", "Remove from starred");
  await goToRoute(page, "/starred");
  await expect(page.getByRole("heading", { name: "Nothing starred yet" })).toBeVisible();
});

test("AC-80.2 a star follows a rename through Coffer; a star added in the viewer shows in Starred", async ({ page }, testInfo) => {
  const layout = layoutFor(testInfo);
  await chooseFromMenu(page, layout, "a.txt", "Add to starred");
  await chooseFromMenu(page, layout, "a.txt", "Rename");
  const dialog = page.getByRole("dialog", { name: "Rename" });
  await dialog.getByLabel("Name").fill("renamed.txt");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(toast(page)).toContainText("Renamed to renamed.txt", { timeout: 20_000 });

  await row(page, "b.txt").focus();
  await page.keyboard.press("Enter");
  const viewer = page.locator('dialog[data-component="Preview"]');
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "More actions", exact: true }).click();
  const add = page.getByRole("menuitem", { name: "Add to starred" }).or(page.locator('[data-component="ContextMenu"]').getByRole("button", { name: "Add to starred" })).filter({ visible: true });
  await add.click();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  await goToRoute(page, "/starred");
  const list = page.locator('[data-component="StarredRow"]');
  await expect(list.filter({ hasText: "renamed.txt" })).toBeVisible();
  await expect(list.filter({ hasText: "b.txt" })).toBeVisible();
  await expect(list.filter({ hasText: /^a\.txt/ })).toHaveCount(0);
});

test("AC-80.4 a starred key that no longer exists shows as missing and can be removed", async ({ page }, testInfo) => {
  await chooseFromMenu(page, layoutFor(testInfo), "a.txt", "Add to starred");
  await expect(toast(page)).toContainText("Added 1 item to starred");
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await s3.send(new DeleteObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/a.txt` }));
  await goToRoute(page, "/starred");
  const starred = page.locator('[data-component="StarredRow"]').filter({ hasText: "a.txt" });
  await expect(starred.getByText(`Not found in ${E2E_BUCKET}.`, { exact: false })).toBeVisible({ timeout: 15_000 });
  await starred.getByRole("button", { name: /^Remove from starred: / }).click();
  await expect(page.getByRole("heading", { name: "Nothing starred yet" })).toBeVisible();
});

test("AC-81.1 and AC-81.2 files opened in the viewer show in Recent on Home and open again from there", async ({ page }) => {
  await goToRoute(page, "/");
  await expect(page.getByRole("heading", { name: "Recent files" })).toHaveCount(0); // AC-24.2: hidden while empty
  await goToRoute(page, `/files/${folder}`);
  await row(page, "a.txt").focus();
  await page.keyboard.press("Enter");
  const viewer = page.locator('dialog[data-component="Preview"]');
  await expect(viewer).toBeVisible();
  await page.keyboard.press("ArrowRight"); // b.txt, by Next
  await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("b.txt");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  await goToRoute(page, "/");
  const recent = page.locator('[data-component="RecentSection"]');
  await expect(recent.getByRole("heading", { name: "Recent files" })).toBeVisible();
  await expect(recent.getByText("Saved in this browser. Nothing is read from your bucket for this list.")).toBeVisible();
  const links = recent.getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toContainText("b.txt");
  await expect(links.first()).toContainText(`${E2E_BUCKET}/${folder}`);
  expect(await axeViolations(page)).toEqual([]);
  await links.first().click();
  await expect(page.getByRole("dialog", { name: "Preview of b.txt" })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(row(page, "a.txt")).toBeVisible();
});
