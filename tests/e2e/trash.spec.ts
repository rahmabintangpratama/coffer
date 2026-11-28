import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createBucket, createClient } from "../integration/client";
import { admin } from "../integration/config";
import { putMany } from "../integration/seed";
import { allowOrigin } from "./fixture";
import { axeViolations, enterApp, goToRoute, layoutFor, type Layout } from "./helpers";

// M6b: Move to trash with Undo, the Trash view, Restore, Delete forever and Empty trash (FR-36, FR-70, FR-71).
// Each test has its own bucket: Empty trash is bucket-wide and the specs run in parallel.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const BATCH = "20261122T090503Z-aaaaaa";
// Toasts stack while earlier ones wait out their time, so a test names the one it means.
const toast = (page: Page, text: string) => page.locator('[data-component="Toast"]').filter({ hasText: text });
const trashRows = (page: Page) => page.locator('[data-component="TrashRow"]');
const fileRow = (page: Page, name: string) => page.locator('[data-component="FileRow"], [data-component="FileTile"]').filter({ hasText: name }).first();

async function freshBucket(): Promise<string> {
  const bucket = await createBucket(s3, "e2e-trash");
  await allowOrigin(s3, bucket);
  return bucket;
}

async function keysIn(bucket: string, prefix = ""): Promise<string[]> {
  const all: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ...(token === undefined ? {} : { ContinuationToken: token }) }));
    all.push(...(page.Contents ?? []).map((object) => object.Key ?? ""));
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return all.sort();
}
const liveKeys = async (bucket: string) => (await keysIn(bucket)).filter((key) => !key.startsWith(".coffer-trash/"));
const put = (bucket: string, key: string, body = "x") => s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));

async function trashFromMenu(page: Page, layout: Layout, name: string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${name}` }).first().click();
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: /^Move to trash/ }).click();
  else await page.getByRole("menuitem", { name: /^Move to trash/ }).click();
}

test("AC-36.1, AC-36.3, AC-70.1, AC-70.4 and AC-71.2 exit check: trash, undo, trash twice, two entries with times, restore one, empty with the typed count", async ({ page }, testInfo) => {
  const layout = layoutFor(testInfo);
  const bucket = await freshBucket();
  await put(bucket, "a.txt", "first");
  await enterApp(page, "/files", { bucket });
  await expect(fileRow(page, "a.txt")).toBeVisible({ timeout: 15_000 });

  // Trash, then Undo within the toast.
  await trashFromMenu(page, layout, "a.txt");
  await expect(toast(page, "Moved 1 item to trash").first()).toBeVisible();
  await expect(fileRow(page, "a.txt")).toHaveCount(0, { timeout: 15_000 });
  await toast(page, "Moved 1 item to trash").first().getByRole("button", { name: "Undo" }).click();
  // M11: Undo closes the trash toast at once, and "Restored" replaces it.
  await expect(toast(page, "Moved 1 item to trash")).toHaveCount(0);
  await expect(toast(page, "Restored 1 item")).toBeVisible({ timeout: 15_000 });
  await expect(fileRow(page, "a.txt")).toBeVisible({ timeout: 15_000 });
  expect(await liveKeys(bucket)).toEqual(["a.txt"]);
  expect(await keysIn(bucket, ".coffer-trash/")).toEqual([]);

  // Trash it again, make the same key again behind the page, and trash that too.
  await trashFromMenu(page, layout, "a.txt");
  await expect(fileRow(page, "a.txt")).toHaveCount(0, { timeout: 15_000 });
  await put(bucket, "a.txt", "second");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(fileRow(page, "a.txt")).toBeVisible({ timeout: 15_000 });
  await trashFromMenu(page, layout, "a.txt");
  await expect(fileRow(page, "a.txt")).toHaveCount(0, { timeout: 15_000 });
  expect(await keysIn(bucket, ".coffer-trash/")).toHaveLength(2);

  // Two entries in Trash, each with its original path and deletion time.
  await goToRoute(page, "/trash");
  await expect(page.getByRole("heading", { level: 1, name: "Trash" })).toBeVisible();
  await expect(trashRows(page)).toHaveCount(2, { timeout: 15_000 });
  for (const row of await trashRows(page).all()) {
    await expect(row).toContainText("a.txt");
    await expect(row).toContainText("Original location: a.txt");
    await expect(row).toContainText(/Deleted .*\d{4}/);
  }

  // Restore one.
  await trashRows(page).first().getByRole("checkbox").check();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(toast(page, "Restored 1 item").last()).toBeVisible({ timeout: 15_000 });
  await expect(toast(page, "Restored 1 item").last().getByRole("button", { name: "Show location" })).toBeVisible();
  await expect(trashRows(page)).toHaveCount(1, { timeout: 15_000 });
  expect(await liveKeys(bucket)).toEqual(["a.txt"]);

  // Empty the trash: the button stays off until the count is typed.
  await page.getByRole("button", { name: "Empty trash" }).click();
  const dialog = page.getByRole("dialog", { name: "Empty trash?" });
  await expect(dialog.getByRole("button", { name: "Delete forever" })).toBeDisabled();
  await dialog.getByLabel(/Type 1 to confirm/).fill("1");
  await dialog.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByRole("heading", { name: "Trash is empty" })).toBeVisible({ timeout: 15_000 });
  expect(await keysIn(bucket, ".coffer-trash/")).toEqual([]);
  expect(await liveKeys(bucket)).toEqual(["a.txt"]);
});

test("AC-70.3 restoring onto a name that exists asks, and Keep both numbers the restored one", async ({ page }) => {
  const bucket = await freshBucket();
  await put(bucket, `.coffer-trash/${BATCH}/a.txt`, "old");
  await put(bucket, "a.txt", "new");
  await enterApp(page, "/trash", { bucket });
  await expect(trashRows(page)).toHaveCount(1, { timeout: 15_000 });
  await trashRows(page).first().getByRole("checkbox").check();
  await page.getByRole("button", { name: "Restore" }).click();
  const conflict = page.getByRole("dialog", { name: "This file already exists" });
  await expect(conflict).toBeVisible();
  await conflict.getByRole("radio", { name: /Keep both/ }).check();
  await conflict.getByRole("button", { name: "Continue" }).click();
  await expect(trashRows(page)).toHaveCount(0, { timeout: 15_000 });
  expect(await liveKeys(bucket)).toEqual(["a (1).txt", "a.txt"]);
});

test("AC-71.2 and AC-71.3 deleting more than 50 items asks for the count, then deletes them all with progress", async ({ page }) => {
  const bucket = await freshBucket();
  const names = Array.from({ length: 55 }, (_, n) => `.coffer-trash/${BATCH}/f-${n.toString().padStart(2, "0")}.txt`);
  await putMany(s3, bucket, names);
  await enterApp(page, "/trash", { bucket });
  await expect(trashRows(page).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await expect(page.getByText("55 selected")).toBeVisible();
  await page.getByRole("button", { name: "Delete forever" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete 55 items forever?" });
  const confirm = dialog.getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type 55 to confirm/).fill("54");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type 55 to confirm/).fill("55");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Trash is empty" })).toBeVisible({ timeout: 20_000 });
  await expect(toast(page, "Deleted 55 items forever")).toBeVisible();
  expect(await keysIn(bucket, ".coffer-trash/")).toEqual([]);
});

test("the Trash screen and its delete dialog pass axe", async ({ page }) => {
  const bucket = await freshBucket();
  await put(bucket, `.coffer-trash/${BATCH}/a.txt`);
  await put(bucket, `.coffer-trash/${BATCH}/docs/b.md`);
  await enterApp(page, "/trash", { bucket });
  await expect(trashRows(page)).toHaveCount(2, { timeout: 15_000 });
  const serious = (violations: Awaited<ReturnType<typeof axeViolations>>) => violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious(await axeViolations(page))).toEqual([]);
  await trashRows(page).first().getByRole("checkbox").check();
  await page.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(serious(await axeViolations(page))).toEqual([]);
});

test("AC-36.5 a folder in the trash is not offered Move to trash again, and a trashed folder comes back whole", async ({ page }, testInfo) => {
  const layout = layoutFor(testInfo);
  const bucket = await freshBucket();
  await putMany(s3, bucket, ["docs/a.txt", "docs/n/b.txt"]);
  await enterApp(page, "/files", { bucket });
  await expect(fileRow(page, "docs")).toBeVisible({ timeout: 15_000 });
  await trashFromMenu(page, layout, "docs");
  await expect(toast(page, "Moved 1 item to trash").first()).toBeVisible();
  await expect(fileRow(page, "docs")).toHaveCount(0, { timeout: 15_000 });
  expect(await liveKeys(bucket)).toEqual([]);
  // Inside the trash prefix Files offers no Move to trash.
  await goToRoute(page, "/files/.coffer-trash/");
  const inner = fileRow(page, ".coffer-trash").or(page.locator('[data-component="FolderTile"], [data-component="FileRow"]').first());
  await expect(inner).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /More actions for/ }).first().click();
  await expect(page.getByRole("menuitem", { name: /^Move to trash/ }).or(page.getByRole("dialog").getByRole("button", { name: /^Move to trash/ }))).toHaveCount(0);
  await page.keyboard.press("Escape");
  await goToRoute(page, "/trash");
  await expect(trashRows(page).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(trashRows(page)).toHaveCount(0, { timeout: 20_000 });
  expect(await liveKeys(bucket)).toEqual(["docs/a.txt", "docs/n/b.txt"]);
});

