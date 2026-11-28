import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { enterApp, goToRoute, layoutFor } from "./helpers";
import { scratchPrefix } from "./scratch";

// M11: toasts say what happened and where, close when their action is used, leave with the screen, and stay clear of the sidebar.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });
const unique = () => scratchPrefix("e2e-toast");
const toast = (page: Page, text: string) => page.locator('[data-component="Toast"]').filter({ hasText: text });
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');

let folder = "";
test.beforeEach(async ({ page }) => {
  folder = unique();
  await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/a.txt`, Body: "x" }));
  await enterApp(page, "/files");
  await goToRoute(page, `/files/${folder}`);
  await expect(rows(page).filter({ hasText: "a.txt" })).toBeVisible({ timeout: 15_000 });
});

test("M11 New folder says Folder created with Open, which opens it", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "New", exact: true }).click();
  if (layoutFor(testInfo) === "compact") await page.getByRole("dialog").getByRole("button", { name: "New folder" }).click();
  else await page.getByRole("menuitem", { name: "New folder" }).click();
  const dialog = page.getByRole("dialog", { name: "New folder" });
  await dialog.getByLabel("Folder name").fill("reports");
  await dialog.getByRole("button", { name: "Create" }).click();
  const created = toast(page, "Folder reports created");
  await expect(created).toBeVisible({ timeout: 15_000 });
  await created.getByRole("button", { name: "Open" }).click();
  await expect(created).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#/files/${folder}/reports`);
});

test("M11 a toast without an action leaves with the screen; the toast host stays clear of the sidebar", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "More actions for a.txt" }).click();
  await page.getByRole("menuitem", { name: "Add to starred" }).or(page.getByRole("dialog").getByRole("button", { name: "Add to starred" })).filter({ visible: true }).click();
  const starred = toast(page, "Added 1 item to starred");
  await expect(starred).toBeVisible();
  if (layoutFor(testInfo) === "sidebar") {
    const host = await page.locator('[data-component="ToastHost"]').boundingBox();
    const nav = await page.getByRole("navigation", { name: "Main navigation" }).boundingBox();
    expect(host && nav ? host.x >= nav.x + nav.width : false).toBe(true);
  }
  await goToRoute(page, "/trash");
  await expect(starred).toHaveCount(0);
});
