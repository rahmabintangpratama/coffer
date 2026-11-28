import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { axeViolations, enterApp, goToRoute } from "./helpers";

// M11, FR-26 and design ux-patterns "Keyboard": shortcuts on the list, the `?` sheet and app-wide keys.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const unique = () => `e2e-keys/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
const toast = (page: Page) => page.locator('[data-component="Toast"]').last();
const keysUnder = async (prefix: string) => ((await s3.send(new ListObjectsV2Command({ Bucket: E2E_BUCKET, Prefix: prefix }))).Contents ?? []).map((object) => object.Key ?? "").sort();

let folder = "";
test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, "keyboard shortcuts are for a hardware keyboard on desktop layouts");
  folder = unique();
  for (const name of ["a.txt", "b.txt"]) await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/${name}`, Body: "x" }));
  await enterApp(page, "/files");
  await goToRoute(page, `/files/${folder}`);
  await expect(row(page, "a.txt")).toBeVisible({ timeout: 15_000 });
});

test("AC-26.3 ? opens the shortcuts sheet and Escape closes it", async ({ page }) => {
  await row(page, "a.txt").focus();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Rename", { exact: true })).toBeVisible();
  await expect(sheet.locator("kbd", { hasText: "F2" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("AC-26.1 F2, M, I and S act on the focused item; the menu shows the hints", async ({ page }) => {
  await row(page, "a.txt").focus();
  await page.keyboard.press("F2");
  await expect(page.getByRole("dialog", { name: "Rename" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Rename" })).toHaveCount(0);

  await row(page, "a.txt").focus();
  await page.keyboard.press("m");
  await expect(page.getByRole("dialog", { name: /^Move/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await row(page, "a.txt").focus();
  await page.keyboard.press("i");
  const details = page.locator('[data-component="DetailsPanel"]').filter({ visible: true });
  await expect(details).toBeVisible();
  // Below 1024 px it is a sheet over the list; close it before the next key.
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    // Closing hands focus back to the row's menu button on the next frame; let it land first.
    await expect(page.getByRole("button", { name: "More actions for a.txt" })).toBeFocused();
  }

  await row(page, "b.txt").focus();
  await page.keyboard.press("s");
  await expect(toast(page)).toContainText("Added 1 item to starred");

  await page.getByRole("button", { name: "More actions for a.txt" }).click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveAttribute("aria-keyshortcuts", "F2");
  await expect(page.getByRole("menuitem", { name: "Rename" }).locator("kbd")).toHaveText("F2");
});

test("AC-26.1 Delete moves the selection to the trash", async ({ page }) => {
  await row(page, "a.txt").click();
  await page.keyboard.press("Delete");
  // Settings may ask first; either way the item ends in the trash.
  const confirm = page.getByRole("dialog", { name: /trash/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /Move to trash/ }).click();
  await expect(toast(page)).toContainText("Moved 1 item to trash", { timeout: 20_000 });
  await expect.poll(() => keysUnder(`${folder}/`), { timeout: 20_000 }).toEqual([`${folder}/b.txt`]);
  // Leave the shared bucket's trash as it was: other specs read its first rows.
  const trashed = (await keysUnder(".coffer-trash/")).filter((key) => key.endsWith(`/${folder}/a.txt`));
  if (trashed.length > 0) await s3.send(new DeleteObjectsCommand({ Bucket: E2E_BUCKET, Delete: { Objects: trashed.map((Key) => ({ Key })) } }));
});

test("AC-26.2 single keys do nothing while typing", async ({ page }) => {
  await row(page, "a.txt").focus();
  await page.keyboard.press("/");
  const pill = page.getByRole("searchbox");
  await expect(pill).toBeFocused();
  await page.keyboard.type("m?s");
  await expect(pill).toHaveValue("m?s");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("AC-26.4 Ctrl or Cmd+K focuses the search", async ({ page }) => {
  // OQ-39: on the Linux runners the key reaches the page and its default is prevented, yet focus stays on the row in
  // every engine; on macOS it moves. Kept visible as fixme until a Linux desktop check settles it.
  test.fixme(process.platform !== "darwin", "OQ-39: focus does not move on the Linux runners");
  await row(page, "a.txt").focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("searchbox")).toBeFocused();
});

test("AC-30.4 Escape clears the selection even with focus on a toast", async ({ page }) => {
  await row(page, "a.txt").click();
  await expect(row(page, "a.txt")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("s");
  await expect(toast(page)).toContainText("Added 1 item to starred");
  await toast(page).getByRole("button").last().focus();
  await page.keyboard.press("Escape");
  await expect(row(page, "a.txt")).toHaveAttribute("aria-selected", "false");
});
