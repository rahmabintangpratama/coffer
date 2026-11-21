import { HeadObjectCommand, ListMultipartUploadsCommand, type S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existingKeys, HEAD_LIMIT, putFolder } from "@/lib/s3/conflicts";
import { listPage } from "@/lib/s3/list";
import { RequestPool } from "@/lib/s3/pool";
import { MIB, uploadObject, type UploadRecord, type UploadStateStore } from "@/lib/s3/upload";
import { createBucket, createClient } from "./client";
import { admin } from "./config";
import { putMany } from "./seed";

// FR-35, FR-40, FR-41, FR-43 against a real server.
const client: S3Client = createClient(admin);
let bucket = "";

const connection = { id: "c1", endpoint: "http://127.0.0.1:9000" };
const blob = (bytes: number) => new Blob([new Uint8Array(bytes).fill(7)], { type: "application/octet-stream" });

function memoryStore() {
  const records = new Map<string, UploadRecord>();
  const store: UploadStateStore = {
    put: (record) => { records.set(record.id, record); return Promise.resolve(); },
    addPart: (id, part) => { records.get(id)?.parts.push(part); return Promise.resolve(); },
    delete: (id) => { records.delete(id); return Promise.resolve(); },
  };
  return { store, records };
}

async function incomplete(): Promise<string[]> {
  const listed = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
  return (listed.Uploads ?? []).map((upload) => upload.Key ?? "");
}

/** Fail the Nth..Mth UploadPart request inside the SDK's retry loop (after the retry middleware, so the SDK sees the failure). */
function failParts(target: S3Client, failures: number, name: string, status: number): () => number {
  let seen = 0;
  target.middlewareStack.add(
    (next, context) => async (args) => {
      if (context.commandName === "UploadPartCommand") {
        seen += 1;
        if (seen <= failures) throw Object.assign(new Error("injected"), { name, $metadata: { httpStatusCode: status } });
      }
      return next(args);
    },
    { step: "finalizeRequest", priority: "low", name: `fault-${name}-${failures.toString()}` },
  );
  return () => seen;
}

beforeAll(async () => { bucket = await createBucket(client, "upload"); }, 30_000);
afterAll(() => { client.destroy(); });

describe("upload (FR-41)", () => {
  it("AC-41.4 puts a small file with one request", async () => {
    await uploadObject({ client, bucket, key: "small/a.txt", body: blob(1000), pool: new RequestPool(() => 4), store: memoryStore().store, connection });
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "small/a.txt" }));
    expect(head.ContentLength).toBe(1000);
  });

  it("AC-41.1 uploads 20 MiB in parts and stores the record before completing", async () => {
    const { store, records } = memoryStore();
    const progress: number[] = [];
    await uploadObject({ client, bucket, key: "multi/20.bin", body: blob(20 * MIB), pool: new RequestPool(() => 4), store, connection, onProgress: (n) => progress.push(n) });
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "multi/20.bin" }));
    expect(head.ContentLength).toBe(20 * MIB);
    expect(progress.at(-1)).toBe(20 * MIB);
    expect(records.size).toBe(0);
    expect(await incomplete()).toEqual([]);
  });

  it("AC-41.1 uploads 200 MiB in 25 parts", async () => {
    await uploadObject({ client, bucket, key: "multi/200.bin", body: blob(200 * MIB), pool: new RequestPool(() => 6), store: memoryStore().store, connection });
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "multi/200.bin" }));
    expect(head.ContentLength).toBe(200 * MIB);
  }, 120_000);

  it("AC-41.3 cancel leaves no incomplete upload at the provider", async () => {
    const controller = new AbortController();
    const { store, records } = memoryStore();
    const promise = uploadObject({
      client, bucket, key: "cancel/c.bin", body: blob(200 * MIB), pool: new RequestPool(() => 2), store, connection, signal: controller.signal,
      onProgress: () => { controller.abort(); },
    });
    await expect(promise).rejects.toMatchObject({ code: "aborted" });
    expect(await incomplete()).toEqual([]);
    expect(records.size).toBe(0);
    await expect(client.send(new HeadObjectCommand({ Bucket: bucket, Key: "cancel/c.bin" }))).rejects.toBeDefined();
  }, 60_000);

  it("AC-41.2 a part that fails twice and then succeeds still completes", async () => {
    const flaky = createClient(admin);
    const seen = failParts(flaky, 2, "InternalError", 500);
    await uploadObject({ client: flaky, bucket, key: "retry/r.bin", body: blob(20 * MIB), pool: new RequestPool(() => 1), store: memoryStore().store, connection });
    expect(seen()).toBeGreaterThan(3);
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "retry/r.bin" }));
    expect(head.ContentLength).toBe(20 * MIB);
    flaky.destroy();
  }, 60_000);

  it("a part that keeps failing aborts the upload at the provider", async () => {
    const broken = createClient(admin);
    failParts(broken, 1000, "InternalError", 500);
    const { records } = memoryStore();
    await expect(
      uploadObject({ client: broken, bucket, key: "fail/f.bin", body: blob(20 * MIB), pool: new RequestPool(() => 2), store: memoryStore().store, connection }),
    ).rejects.toMatchObject({ retryable: true });
    expect(await incomplete()).toEqual([]);
    expect(records.size).toBe(0);
    broken.destroy();
  }, 60_000);

  it("SlowDown past the SDK's retries throttles the pool and the upload still completes", async () => {
    const slow = createClient(admin);
    // More failures than one SDK retry loop absorbs, so the orchestrator itself sees the throttling.
    failParts(slow, 5, "SlowDown", 503);
    // One part in flight, so every failure lands on the same part.
    const pool = new RequestPool(() => 1);
    const throttle = vi.spyOn(pool, "throttle");
    await uploadObject({ client: slow, bucket, key: "slow/s.bin", body: blob(20 * MIB), pool, store: memoryStore().store, connection });
    expect(throttle).toHaveBeenCalled();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "slow/s.bin" }));
    expect(head.ContentLength).toBe(20 * MIB);
    slow.destroy();
  }, 60_000);
});

describe("conflicts and folders (FR-35, FR-43)", () => {
  it("AC-35.1 writes a zero-byte placeholder and lists the folder", async () => {
    await putFolder(client, { bucket, key: "made/new/" });
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "made/new/" }));
    expect(head.ContentLength).toBe(0);
    const page = await listPage(client, { bucket, prefix: "made/", root: "" });
    expect(page.folders.map((folder) => folder.name)).toEqual(["new"]);
  });

  it("AC-43.1 finds existing keys with HeadObject for a small batch", async () => {
    await putMany(client, bucket, ["c1/a.txt", "c1/b.txt"]);
    const found = await existingKeys(client, { bucket, keys: ["c1/a.txt", "c1/new.txt", "c1/b.txt"] });
    expect([...found].sort()).toEqual(["c1/a.txt", "c1/b.txt"]);
  });

  it("AC-43.1 lists the target folders for a batch over 50, including keys past the first page", async () => {
    const existing = Array.from({ length: 1200 }, (_, n) => `c2/e-${n.toString().padStart(4, "0")}.txt`);
    await putMany(client, bucket, existing);
    const wanted = [...existing.slice(1150), ...Array.from({ length: 60 }, (_, n) => `c2/fresh-${n.toString()}.txt`)];
    expect(wanted.length).toBeGreaterThan(HEAD_LIMIT);
    const found = await existingKeys(client, { bucket, keys: wanted });
    expect([...found].sort()).toEqual(existing.slice(1150).sort());
  }, 60_000);
});
