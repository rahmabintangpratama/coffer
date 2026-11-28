import { PutObjectCommand } from "@aws-sdk/client-s3";
import { expect, test } from "./test";
import { createBucket, createClient } from "../integration/client";
import { admin } from "../integration/config";
import { allowOrigin } from "./fixture";
import { axeViolations, enterApp, goToRoute } from "./helpers";

// M11: Storage usage on demand (FR-90), on a bucket of its own so the totals are exact.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const PASS = "correct horse battery staple";

async function bucketWith(objects: Record<string, number>): Promise<string> {
  const bucket = await createBucket(s3, "e2e-storage");
  await allowOrigin(s3, bucket);
  for (const [key, size] of Object.entries(objects)) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "x".repeat(size) }));
  return bucket;
}

test("AC-90.1 and AC-90.3 nothing is counted until asked; the result shows the total and the largest folders", async ({ page }) => {
  const bucket = await bucketWith({ "a/1.txt": 10, "a/b/2.txt": 5, "big/x.bin": 100, "top.txt": 1 });
  const lists: string[] = [];
  page.on("request", (request) => { if (request.url().includes("list-type=2")) lists.push(request.url()); });
  await enterApp(page, "/files", { bucket, passphrase: PASS });
  await goToRoute(page, "/storage");
  await expect(page.getByRole("heading", { name: "Usage isn’t calculated yet" })).toBeVisible();
  const before = lists.length;
  expect(await axeViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Calculate usage" }).click();
  const result = page.locator('[data-component="UsageResult"]');
  await expect(result.getByText("116 B")).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText(/^in 4 objects · calculated /)).toBeVisible();
  // Listed without a delimiter: one request for four objects.
  expect(lists.length - before).toBe(1);
  expect(lists.at(-1)).not.toContain("delimiter=");
  const folders = result.getByRole("listitem");
  await expect(folders).toHaveCount(3);
  await expect(folders.nth(0)).toContainText("big");
  await expect(folders.nth(1)).toContainText("a");
  await expect(folders.nth(1)).toContainText("2 objects");
  await expect(folders.nth(2)).toContainText("Files at the top level");
  await expect(page.getByRole("button", { name: "Calculate again" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("AC-90.2 a running count can be cancelled and keeps what it counted as partial", async ({ page }) => {
  const bucket = await bucketWith({ "a/1.txt": 1 });
  await enterApp(page, "/files", { bucket, passphrase: PASS });
  await goToRoute(page, "/storage");
  // Hold the listing so the running state can be seen and stopped.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.search.includes("list-type=2"), async (route) => { await held; await route.continue().catch(() => undefined); });
  await page.getByRole("button", { name: "Calculate usage" }).click();
  await expect(page.getByRole("heading", { name: "Calculating usage" })).toBeVisible();
  await expect(page.getByText("Counted 0 objects so far.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Calculation stopped" })).toBeVisible();
  release();
  await expect(page.getByRole("button", { name: "Calculate again" })).toBeVisible();
});
