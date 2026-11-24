import "fake-indexeddb/auto";
import { CreateMultipartUploadCommand, ListMultipartUploadsCommand, type S3Client } from "@aws-sdk/client-s3";
import { deleteDB } from "idb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { abortRecorded } from "@/lib/s3/abort-uploads";
import { closeSharedDb, DB_NAME, sharedDb, type UploadRecord } from "@/lib/storage/db";
import { dataOf, purgeConnectionData } from "@/lib/storage/connection-data";
import { uploadStore } from "@/lib/storage/uploads";
import { createBucket, createClient } from "./client";
import { admin } from "./config";

// OQ-37, C-55: removing a connection aborts its incomplete multipart uploads and its rows; other connections keep theirs.
const client: S3Client = createClient(admin);
let bucket = "";

const ENDPOINT = "http://127.0.0.1:9000";

async function startUpload(connectionId: string, key: string): Promise<UploadRecord> {
  const created = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }));
  const record: UploadRecord = { id: `${connectionId}-${key}`, connectionId, endpoint: ENDPOINT, bucket, key, uploadId: created.UploadId ?? "", partSize: 8 * 1024 * 1024, size: 20 * 1024 * 1024, parts: [], startedAt: "2026-01-01T00:00:00.000Z" };
  await uploadStore.put(record);
  return record;
}

const openUploads = async (): Promise<string[]> => ((await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }))).Uploads ?? []).map((upload) => upload.Key ?? "").sort();

async function seedRows(connectionId: string): Promise<void> {
  const handle = await sharedDb();
  await handle.put("starred", { connectionId, bucket, key: "a.txt" });
  await handle.put("recent", { connectionId, bucket, key: "b.txt" });
  await handle.put("journal", { id: `j-${connectionId}`, kind: "move", connectionId, endpoint: ENDPOINT, bucket, source: "x/", target: "y/", status: "done", phase: "finished", total: 1, done: 1, startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
}

beforeAll(async () => { bucket = await createBucket(client, "removal"); }, 30_000);
beforeEach(async () => {
  await closeSharedDb();
  await deleteDB(DB_NAME);
});
afterAll(() => { client.destroy(); });

describe("remove a connection (OQ-37)", () => {
  it("aborts only that connection's incomplete multipart uploads and deletes only its rows", async () => {
    await startUpload("gone", "gone/one.bin");
    await startUpload("gone", "gone/two.bin");
    await startUpload("stays", "stays/three.bin");
    await seedRows("gone");
    await seedRows("stays");
    expect(await openUploads()).toEqual(["gone/one.bin", "gone/two.bin", "stays/three.bin"]);

    const data = await dataOf("gone");
    expect(data.uploads).toHaveLength(2);
    expect(data.starred).toBe(1);
    expect(data.recent).toBe(1);
    expect(await abortRecorded(client, data.uploads)).toEqual({ aborted: 2, failed: 0 });
    await purgeConnectionData("gone");

    expect(await openUploads()).toEqual(["stays/three.bin"]);
    const left = await dataOf("gone");
    expect(left).toEqual({ unfinished: [], uploads: [], starred: 0, recent: 0 });
    const handle = await sharedDb();
    expect(await handle.getAll("journal")).toHaveLength(1);
    expect((await uploadStore.list()).map((record) => record.connectionId)).toEqual(["stays"]);
    const kept = await dataOf("stays");
    expect(kept.uploads).toHaveLength(1);
    expect(kept.starred).toBe(1);
    expect(kept.recent).toBe(1);
  });

  it("counts an upload the provider no longer has as aborted and one it refuses as failed", async () => {
    const live = await startUpload("gone", "gone/live.bin");
    const gone = { ...live, key: "gone/never.bin", uploadId: "no-such-upload" };
    const refused = { ...live, bucket: "coffer-no-such-bucket" };
    expect(await abortRecorded(client, [live, gone, refused])).toEqual({ aborted: 2, failed: 1 });
    expect(await openUploads()).not.toContain("gone/live.bin");
  });

  it("lists unfinished moves for the block and ignores finished ones", async () => {
    const handle = await sharedDb();
    const base = { kind: "move" as const, connectionId: "c", endpoint: ENDPOINT, bucket, source: "x/", target: "y/", phase: "copying" as const, total: 4, done: 1, startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    await handle.put("journal", { ...base, id: "i", status: "interrupted" });
    await handle.put("journal", { ...base, id: "r", status: "running" });
    await handle.put("journal", { ...base, id: "d", status: "done" });
    await handle.put("journal", { ...base, id: "x", status: "discarded" });
    await handle.put("journal", { ...base, id: "o", connectionId: "other", status: "interrupted" });
    expect((await dataOf("c")).unfinished.map((entry) => entry.id).sort()).toEqual(["i", "r"]);
  });
});
