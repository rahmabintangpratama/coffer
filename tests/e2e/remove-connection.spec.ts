import { CreateMultipartUploadCommand, ListMultipartUploadsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createBucket, createClient } from "../integration/client";
import { admin, s3Fixture } from "../integration/config";
import { allowOrigin } from "./fixture";
import { dumpStorage, enterApp, goToRoute } from "./helpers";

// OQ-37, C-55 (FR-11, AC-11.4): Remove connection changes only data in this browser, and an unfinished move blocks it.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const PASS = "correct horse battery staple";
const NOW = "2026-11-22T09:00:00.000Z";

async function savedConnection(page: Page): Promise<{ bucket: string; id: string }> {
  const bucket = await createBucket(s3, "e2e-remove");
  await allowOrigin(s3, bucket);
  await enterApp(page, "/files", { bucket, passphrase: PASS });
  const id = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("coffer");
        open.onerror = () => { reject(new Error("open")); };
        open.onsuccess = () => {
          const all = open.result.transaction("connections", "readonly").objectStore("connections").getAllKeys();
          all.onsuccess = () => { open.result.close(); resolve(all.result[0] as string); };
        };
      }),
  );
  return { bucket, id };
}

/** Write rows straight into the app's database, the way earlier sessions would have left them. */
async function seed(page: Page, stores: Record<string, unknown[]>): Promise<void> {
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("coffer");
        open.onerror = () => { reject(new Error("open")); };
        open.onsuccess = () => {
          const tx = open.result.transaction(Object.keys(rows), "readwrite");
          for (const [name, values] of Object.entries(rows)) for (const value of values) tx.objectStore(name).put(value);
          tx.oncomplete = () => { open.result.close(); resolve(); };
          tx.onerror = () => { reject(new Error("write")); };
        };
      }),
    stores,
  );
}

async function startUpload(bucket: string, key: string): Promise<string> {
  const created = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }));
  return created.UploadId ?? "";
}
const uploadRecord = (connectionId: string, bucket: string, key: string, uploadId: string) => ({
  id: `${connectionId}-${key}`, connectionId, endpoint: s3Fixture.endpoint, bucket, key, uploadId, partSize: 8 * 1024 * 1024, size: 20 * 1024 * 1024, parts: [], startedAt: NOW,
});
const openUploads = async (bucket: string): Promise<string[]> => ((await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket }))).Uploads ?? []).map((upload) => upload.Key ?? "").sort();
const keysIn = async (bucket: string): Promise<string[]> => ((await s3.send(new ListObjectsV2Command({ Bucket: bucket }))).Contents ?? []).map((object) => object.Key ?? "").sort();
const journalEntry = (connectionId: string, bucket: string, id: string, over: Record<string, unknown> = {}) => ({
  id, kind: "move", connectionId, endpoint: s3Fixture.endpoint, bucket, source: "src/a.txt", target: "dst/a.txt", total: 0, done: 0, status: "interrupted", phase: "planning", startedAt: NOW, updatedAt: NOW, ...over,
});

async function openRemoveDialog(page: Page): Promise<void> {
  await goToRoute(page, "/settings/connections");
  await page.getByRole("button", { name: /^Remove: / }).click();
}

test("OQ-37 normal removal lists what goes, aborts its uploads, and leaves nothing of the connection or anything of another", async ({ page }) => {
  const { bucket, id } = await savedConnection(page);
  const mine = await startUpload(bucket, "mine/big.bin");
  const theirs = await startUpload(bucket, "theirs/big.bin");
  await seed(page, {
    uploads: [uploadRecord(id, bucket, "mine/big.bin", mine), uploadRecord("other-connection", bucket, "theirs/big.bin", theirs)],
    starred: [{ connectionId: id, bucket, key: "a.txt" }, { connectionId: "other-connection", bucket, key: "keep.txt" }],
    recent: [{ connectionId: id, bucket, key: "b.txt" }, { connectionId: "other-connection", bucket, key: "keep-recent.txt" }],
    journal: [journalEntry(id, bucket, "done-entry", { status: "done", phase: "finished" }), journalEntry("other-connection", bucket, "other-entry", { status: "done", phase: "finished" })],
  });
  expect(await dumpStorage(page)).toContain(id);

  await openRemoveDialog(page);
  const dialog = page.getByRole("dialog", { name: /^Remove / });
  await expect(dialog.getByText("Its saved keys")).toBeVisible();
  await expect(dialog.getByText("1 unfinished upload, cancelled at your provider")).toBeVisible();
  await expect(dialog.getByText("1 starred item")).toBeVisible();
  await expect(dialog.getByText("1 recent file")).toBeVisible();
  await expect(dialog.getByText(/Your bucket and its files are not touched/)).toBeVisible();
  await dialog.getByRole("button", { name: "Remove" }).click();

  // The only connection is gone, so the app is back at Welcome; the toast says how the abort went.
  await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible({ timeout: 20_000 });
  expect(await openUploads(bucket)).toEqual(["theirs/big.bin"]);

  const dump = await dumpStorage(page);
  expect(dump).not.toContain(id);
  expect(dump).not.toContain(mine);
  expect(dump).not.toContain("mine/big.bin");
  expect(dump).not.toContain('"a.txt"');
  expect(dump).not.toContain('"b.txt"');
  expect(dump).not.toContain("done-entry");
  expect(dump).not.toContain(admin.accessKeyId);
  // Another connection's rows are not touched.
  for (const kept of ["theirs/big.bin", "keep.txt", "keep-recent.txt", "other-entry"]) expect(dump).toContain(kept);
});

test("OQ-37 an unfinished move blocks the removal; Discard closes it and the removal goes on", async ({ page }) => {
  const { bucket, id } = await savedConnection(page);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "src/a.txt", Body: "x" }));
  await seed(page, { journal: [journalEntry(id, bucket, "cut-off")] });

  await openRemoveDialog(page);
  const blocked = page.getByRole("dialog", { name: "Finish the unfinished moves first" });
  await expect(blocked.getByText("a.txt: 0 of 0 done")).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Remove / })).toHaveCount(0);
  await blocked.getByRole("button", { name: "Discard" }).click();

  // Discard deletes nothing in the bucket; the confirmation follows.
  const confirm = page.getByRole("dialog", { name: /^Remove / });
  await expect(confirm).toBeVisible();
  expect(await keysIn(bucket)).toEqual(["src/a.txt"]);
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible({ timeout: 20_000 });
  const dump = await dumpStorage(page);
  expect(dump).not.toContain(id);
  expect(dump).not.toContain("cut-off");
});

test("OQ-37 an unfinished move blocks the removal; Resume finishes it, then the removal goes through", async ({ page }) => {
  const { bucket, id } = await savedConnection(page);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "src/a.txt", Body: "x" }));
  await seed(page, { journal: [journalEntry(id, bucket, "cut-off")] });

  await openRemoveDialog(page);
  const blocked = page.getByRole("dialog", { name: "Finish the unfinished moves first" });
  await blocked.getByRole("button", { name: "Resume" }).click();
  await expect(blocked).toHaveCount(0);
  await expect.poll(() => keysIn(bucket), { timeout: 20_000 }).toEqual(["dst/a.txt"]);

  // The finished entry no longer blocks.
  await expect.poll(async () => (await dumpStorage(page)).includes('"status":"done"'), { timeout: 15_000 }).toBe(true);
  await page.getByRole("button", { name: /^Remove: / }).click();
  const confirm = page.getByRole("dialog", { name: /^Remove / });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible({ timeout: 20_000 });
  expect(await keysIn(bucket)).toEqual(["dst/a.txt"]);
  expect(await dumpStorage(page)).not.toContain(id);
});
