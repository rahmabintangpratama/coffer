import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createBucket, createClient } from "../integration/client";
import { admin } from "../integration/config";
import { allowOrigin } from "./fixture";
import { axeViolations, enterApp, goToRoute } from "./helpers";

// M11, AC-23.3 and AC-23.6: the pill filters this folder and says so; "Search all of {bucket}" scans the bucket.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });
const PASS = "correct horse battery staple";
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');

async function seeded(): Promise<string> {
  const bucket = await createBucket(s3, "e2e-search");
  await allowOrigin(s3, bucket);
  for (const key of ["top.txt", "docs/report.pdf", "docs/deep/summary.PDF", "notes/plan.md", ".coffer-trash/20261128T000000Z-abc123/old.pdf"]) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "x" }));
  }
  return bucket;
}

test("AC-23.6 a search at the top names what it searched, then finds matches in every folder with their location", async ({ page }) => {
  const bucket = await seeded();
  await enterApp(page, "/files", { bucket, passphrase: PASS });
  await expect(rows(page).filter({ hasText: "top.txt" })).toBeVisible({ timeout: 15_000 });
  const pill = page.getByRole("searchbox", { name: `Search names at the top of ${bucket}` });
  await pill.fill("pdf");
  await expect(page.getByText(`Only names at the top of ${bucket} were searched, not the folders inside it.`, { exact: false })).toBeVisible();

  await page.getByRole("button", { name: `Search all of ${bucket}` }).click();
  const results = page.locator('[data-component="BucketSearch"]');
  await expect(results.getByRole("status")).toContainText(`Searched all 5 names in ${bucket}.`, { timeout: 15_000 });
  await expect(results.getByRole("status")).toContainText("2 matches");
  const items = results.locator('[data-component="SearchResult"]');
  await expect(items).toHaveCount(2); // the trash copy is left out
  await expect(items.filter({ hasText: "summary.PDF" }).getByRole("link", { name: `In ${bucket}/docs/deep` })).toBeVisible();
  // axe crashes Firefox's content process on long pages in CI (D-50); Chromium and WebKit check it.
  expect(await axeViolations(page)).toEqual([]);

  // Typing narrows what was scanned, with no new listing.
  let lists = 0;
  page.on("request", (request) => { if (request.url().includes("list-type=2")) lists += 1; });
  await pill.fill("summ");
  await expect(items).toHaveCount(1);
  expect(lists).toBe(0);

  // The location opens the folder.
  await items.first().getByRole("link", { name: `In ${bucket}/docs/deep` }).click();
  await expect(rows(page).filter({ hasText: "summary.PDF" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("searchbox", { name: "Search names in deep" })).toBeVisible();
});

test("AC-23.6 a file match opens in the viewer; hidden files on include the trash", async ({ page }) => {
  const bucket = await seeded();
  await enterApp(page, "/files", { bucket, passphrase: PASS });
  await expect(rows(page).filter({ hasText: "top.txt" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("searchbox", { name: `Search names at the top of ${bucket}` }).fill("report");
  await page.getByRole("button", { name: `Search all of ${bucket}` }).click();
  const results = page.locator('[data-component="BucketSearch"]');
  await results.getByRole("link", { name: "report.pdf" }).click();
  await expect(page.getByRole("dialog", { name: "Preview of report.pdf" })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(rows(page).filter({ hasText: "report.pdf" })).toBeVisible();

  await goToRoute(page, "/settings/behavior");
  await page.getByRole("switch", { name: /hidden files/i }).or(page.getByRole("checkbox", { name: /hidden files/i })).click();
  await goToRoute(page, "/files");
  await expect(rows(page).filter({ hasText: "top.txt" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("searchbox", { name: `Search names at the top of ${bucket}` }).fill("old");
  await page.getByRole("button", { name: `Search all of ${bucket}` }).click();
  await expect(page.locator('[data-component="SearchResult"]').filter({ hasText: "old.pdf" })).toBeVisible({ timeout: 15_000 });
});
