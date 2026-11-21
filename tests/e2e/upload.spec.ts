import { mkdirSync, mkdtempSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { GetObjectCommand, HeadObjectCommand, ListMultipartUploadsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { connectCustom, enterApp, layoutFor, type Layout } from "./helpers";

// M4: New menu, folder and file upload, conflicts, the transfer panel and abort on reload
// (FR-35, FR-40, FR-41, FR-43, FR-44).
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const MIB = 1024 * 1024;
const unique = () => `e2e-up/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

async function keysUnder(prefix: string): Promise<string[]> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: E2E_BUCKET, Prefix: prefix }));
  return (listed.Contents ?? []).map((object) => object.Key ?? "").sort();
}
// Scoped to the test's own folder: specs run in parallel against one bucket, and another test's upload in flight must not count.
const incompleteIn = async (folder: string) => ((await s3.send(new ListMultipartUploadsCommand({ Bucket: E2E_BUCKET, Prefix: `${folder}/` }))).Uploads ?? []).length;

async function openFolder(page: Page, folder: string): Promise<void> {
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/files/${folder}`);
  await expect(page.getByRole("heading", { name: /This folder is empty|has no files yet/ })).toBeVisible({ timeout: 15_000 });
}

/** Slow every part request so an upload can be seen and interrupted while it runs. */
async function slowParts(page: Page, ms = 1500): Promise<void> {
  await page.route(/partNumber=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => undefined);
  });
}

/** A sparse file on disk: setInputFiles refuses buffers over 50 MB, and the bytes themselves do not matter. */
function bigFile(name: string, mib: number): string {
  const path = join(mkdtempSync(join(tmpdir(), "coffer-big-")), name);
  writeFileSync(path, "");
  truncateSync(path, mib * MIB);
  return path;
}

const filesInput = (page: Page) => page.getByTestId("upload-files-input");

test.describe("upload", () => {
  let folder = "";
  test.beforeEach(async ({ page }) => {
    folder = unique();
    await enterApp(page, "/files");
    await openFolder(page, folder);
  });

  test("AC-40.1 uploads files into the current folder and the list shows them", async ({ page }) => {
    await filesInput(page).setInputFiles([
      { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("alpha") },
      { name: "empty.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(0) },
    ]);
    await expect(page.getByRole("heading", { level: 2, name: "Uploaded 2 items" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-component="FileRow"], [data-component="FileTile"]').filter({ hasText: "a.txt" }).first()).toBeVisible();
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/a.txt`, `${folder}/empty.bin`]);
    const body = await s3.send(new GetObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/a.txt` }));
    expect(await body.Body?.transformToString()).toBe("alpha");
  });

  test("AC-40.1 a folder upload keeps its nested structure", async ({ page }) => {
    const root = mkdtempSync(join(tmpdir(), "coffer-up-"));
    mkdirSync(join(root, "photos", "2026"), { recursive: true });
    writeFileSync(join(root, "photos", "top.txt"), "top");
    writeFileSync(join(root, "photos", "2026", "deep.txt"), "deep");
    await page.getByTestId("upload-folder-input").setInputFiles(join(root, "photos"));
    await expect(page.getByRole("heading", { level: 2, name: "Uploaded 2 items" })).toBeVisible({ timeout: 30_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/photos/2026/deep.txt`, `${folder}/photos/top.txt`]);
  });

  test("AC-40.4 a name the bucket cannot store is reported before any upload starts", async ({ page }) => {
    await filesInput(page).setInputFiles({ name: `${"x".repeat(1100)}.txt`, mimeType: "text/plain", buffer: Buffer.from("x") });
    await expect(page.getByText(/can’t be uploaded: its name is too long/)).toBeVisible();
    await expect(page.locator('[data-component="TransferPanel"]')).toHaveCount(0);
    expect(await keysUnder(`${folder}/`)).toEqual([]);
  });

  test("AC-40.2 dropping files shows the overlay and uploads them", async ({ page }) => {
    const section = page.locator('[data-component="FilesScreen"]');
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(["dropped"], "dropped.txt", { type: "text/plain" }));
      return data;
    });
    await section.dispatchEvent("dragenter", { dataTransfer: transfer });
    await expect(page.getByText(/^Drop files to upload them to/)).toBeVisible();
    await section.dispatchEvent("drop", { dataTransfer: transfer });
    await expect(page.getByText(/^Drop files to upload them to/)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Uploaded 1 item" })).toBeVisible({ timeout: 30_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/dropped.txt`]);
  });

  test("AC-35.1 and AC-35.2 New folder writes a placeholder and rejects bad names", async ({ page }, testInfo) => {
    const layout: Layout = layoutFor(testInfo);
    await page.getByRole("button", { name: "New", exact: true }).click();
    if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: "New folder" }).click();
    else await page.getByRole("menuitem", { name: "New folder" }).click();
    const dialog = page.getByRole("dialog", { name: "New folder" });
    await dialog.getByLabel("Folder name").fill("a/b");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByText("Names can’t contain slashes. Use Move to change folders.")).toBeVisible();
    await dialog.getByLabel("Folder name").fill("reports");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.locator('[data-component="FileRow"], [data-component="FolderTile"]').filter({ hasText: "reports" }).first()).toBeVisible({ timeout: 15_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/reports/`]);
  });

  test("a running upload shows a progressbar with text and passes axe", async ({ page }) => {
    await slowParts(page, 2500);
    await filesInput(page).setInputFiles(bigFile("big.bin", 40));
    const bar = page.getByRole("progressbar", { name: "big.bin" });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuetext", /./);
    const result = await new AxeBuilder({ page }).include('[data-component="TransferPanel"]').analyze();
    expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await page.getByRole("button", { name: "Cancel upload: big.bin" }).click();
    await expect(bar).toHaveCount(0);
  });

  test("AC-41.3 cancel aborts the multipart upload at the provider", async ({ page }) => {
    await slowParts(page);
    await filesInput(page).setInputFiles(bigFile("cancel.bin", 60));
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Cancel upload: cancel.bin" }).click();
    await expect(page.getByRole("progressbar", { name: "cancel.bin" })).toHaveCount(0);
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBe(0);
    expect(await keysUnder(`${folder}/`)).toEqual([]);
  });

  test("AC-41.5 and AC-44.5 a reload mid-upload leaves nothing open and the panel says it was interrupted", async ({ page }) => {
    await slowParts(page, 4000);
    await filesInput(page).setInputFiles(bigFile("interrupted.bin", 60));
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);
    // The record is stored before the first part; wait until it is in IndexedDB.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open("coffer");
              open.onerror = () => { reject(new Error("open")); };
              open.onsuccess = () => {
                const request = open.result.transaction("uploads").objectStore("uploads").count();
                request.onsuccess = () => { resolve(request.result); };
              };
            }),
        ),
      )
      .toBe(1);
    await page.unroute(/partNumber=/);
    await page.reload();
    await connectCustom(page);
    await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await expect(page.getByText("interrupted.bin was interrupted when the page closed. Start it again.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 2, name: "Upload interrupted" })).toBeVisible();
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBe(0);
  });
});

test("D-36 reloading a second tab does not abort an upload that is still running in the first", async ({ page, context }) => {
  test.setTimeout(120_000);
  const folder = unique();
  await enterApp(page, "/files");
  await openFolder(page, folder);
  // Each part waits 4 s, so the upload is still running while the second tab loads.
  await slowParts(page, 4000);
  await filesInput(page).setInputFiles(bigFile("shared.bin", 40));
  await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);

  const other = await context.newPage();
  await enterApp(other, "/files");
  await expect(other.getByRole("grid").or(other.getByRole("heading", { name: /This folder is empty|has no files yet/ }))).toBeVisible({ timeout: 30_000 });
  // The second tab found the stored record, saw its lock held and left it alone; a reload of that tab does the same.
  await other.reload();
  await other.close();

  await expect(page.getByRole("heading", { level: 2, name: "Uploaded 1 item" })).toBeVisible({ timeout: 90_000 });
  const head = await s3.send(new HeadObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/shared.bin` }));
  expect(head.ContentLength).toBe(40 * MIB);
  expect(await incompleteIn(folder)).toBe(0);
});

test.describe("conflicts (FR-43)", () => {
  let folder = "";
  test.beforeEach(async ({ page }) => {
    folder = unique();
    for (const name of ["a.txt", "b.txt"]) await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/${name}`, Body: "old" }));
    await enterApp(page, "/files");
    await page.evaluate((hash) => { window.location.hash = hash; }, `#/files/${folder}`);
    await expect(page.locator('[data-component="FileRow"], [data-component="FileTile"]').filter({ hasText: "a.txt" }).first()).toBeVisible({ timeout: 15_000 });
  });

  const batch = [
    { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("new-a") },
    { name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("new-b") },
    { name: "c.txt", mimeType: "text/plain", buffer: Buffer.from("new-c") },
  ];
  const read = async (key: string) => (await (await s3.send(new GetObjectCommand({ Bucket: E2E_BUCKET, Key: key }))).Body?.transformToString()) ?? "";

  test("AC-43.1 and AC-43.2 Keep both with Apply to all saves the new files as name (1).ext", async ({ page }) => {
    await filesInput(page).setInputFiles(batch);
    const dialog = page.getByRole("dialog", { name: "This file already exists" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`${folder.split("/").at(-1) ?? ""} already has a.txt.`)).toBeVisible();
    await dialog.getByRole("radio", { name: /Keep both/ }).check();
    await dialog.getByLabel("Apply to all 2 conflicts").check();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Uploaded 3 items" })).toBeVisible({ timeout: 30_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/a (1).txt`, `${folder}/a.txt`, `${folder}/b (1).txt`, `${folder}/b.txt`, `${folder}/c.txt`]);
    expect(await read(`${folder}/a.txt`)).toBe("old");
    expect(await read(`${folder}/a (1).txt`)).toBe("new-a");
  });

  test("AC-43.3 Replace overwrites the old file with the new one", async ({ page }) => {
    await filesInput(page).setInputFiles(batch);
    const dialog = page.getByRole("dialog", { name: "This file already exists" });
    await dialog.getByRole("radio", { name: /Replace/ }).check();
    await dialog.getByLabel("Apply to all 2 conflicts").check();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Uploaded 3 items" })).toBeVisible({ timeout: 30_000 });
    expect(await read(`${folder}/a.txt`)).toBe("new-a");
    expect(await read(`${folder}/b.txt`)).toBe("new-b");
  });

  test("AC-43.1 Skip leaves the old file and uploads only the rest", async ({ page }) => {
    await filesInput(page).setInputFiles(batch);
    const dialog = page.getByRole("dialog", { name: "This file already exists" });
    await dialog.getByRole("radio", { name: /Skip/ }).check();
    await dialog.getByLabel("Apply to all 2 conflicts").check();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Uploaded 1 item" })).toBeVisible({ timeout: 30_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/a.txt`, `${folder}/b.txt`, `${folder}/c.txt`]);
    expect(await read(`${folder}/a.txt`)).toBe("old");
  });
});
