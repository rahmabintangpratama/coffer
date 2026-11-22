import { mkdtempSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadObjectCommand, ListMultipartUploadsCommand } from "@aws-sdk/client-s3";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { enterApp } from "./helpers";

// M4 exit check: a 500 MB upload with live progress. It writes a 500 MB sparse file and
// moves 500 MB to the fixture, so it runs on request: COFFER_E2E_LARGE=1 pnpm test:e2e upload-large
// (cancel and reload mid-upload run in upload.spec.ts on smaller files).
test.skip(process.env.COFFER_E2E_LARGE !== "1", "Set COFFER_E2E_LARGE=1 to run the 500 MB upload.");

test("exit check: a 500 MB upload shows live progress and completes with nothing left open", async ({ page }) => {
  test.setTimeout(300_000);
  const s3 = createClient(admin);
  const dir = mkdtempSync(join(tmpdir(), "coffer-500-"));
  const path = join(dir, "huge.bin");
  writeFileSync(path, "");
  truncateSync(path, 500 * 1024 * 1024);
  const folder = `e2e-up/large-${Date.now().toString(36)}`;

  await enterApp(page, "/files");
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/files/${folder}`);
  await expect(page.getByRole("heading", { name: "This folder is empty" })).toBeVisible();
  await page.getByTestId("upload-files-input").setInputFiles(path);

  const bar = page.getByRole("progressbar", { name: "huge.bin" });
  await expect(bar).toBeVisible();
  // Progress moves in whole parts, so it passes through values between 0 and 100.
  await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow")), { timeout: 120_000 }).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { level: 2, name: "Uploaded 1 item" })).toBeVisible({ timeout: 240_000 });

  const head = await s3.send(new HeadObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/huge.bin` }));
  expect(head.ContentLength).toBe(500 * 1024 * 1024);
  const open = await s3.send(new ListMultipartUploadsCommand({ Bucket: E2E_BUCKET, Prefix: "e2e-up/" }));
  expect(open.Uploads ?? []).toEqual([]);
  s3.destroy();
});
