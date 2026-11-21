// @vitest-environment node
import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
import { RequestPool } from "./pool";
import { MAX_OBJECT_BYTES, MAX_PARTS, MIB, partSizeFor, uploadObject, type UploadRecord, type UploadStateStore } from "./upload";

interface Call { name: string; input: Record<string, unknown> }

/** A fake client that answers the five commands the orchestrator uses and logs them in order. */
function fake(handlers: Partial<Record<string, (input: Record<string, unknown>, call: number) => unknown>> = {}) {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const client = {
    send: vi.fn((command: { constructor: { name: string }; input: Record<string, unknown> }, options?: { abortSignal?: AbortSignal }) => {
      const name = command.constructor.name.replace("Command", "");
      calls.push({ name, input: command.input });
      const call = (counts[name] = (counts[name] ?? 0) + 1);
      return Promise.resolve().then(() => {
        if (options?.abortSignal?.aborted) throw Object.assign(new Error("x"), { name: "AbortError" });
        const handler = handlers[name];
        if (handler) return handler(command.input, call);
        if (name === "CreateMultipartUpload") return { UploadId: "up-1" };
        if (name === "UploadPart") return { ETag: `"etag-${String(command.input.PartNumber)}"` };
        return {};
      });
    }),
  };
  return { client: client as unknown as S3Client, calls };
}

function memoryStore() {
  const log: string[] = [];
  const records = new Map<string, UploadRecord>();
  const store: UploadStateStore = {
    put: (record) => { log.push("put"); records.set(record.id, { ...record }); return Promise.resolve(); },
    addPart: (id, part) => { log.push(`part ${part.partNumber.toString()}`); records.get(id)?.parts.push(part); return Promise.resolve(); },
    delete: (id) => { log.push("delete"); records.delete(id); return Promise.resolve(); },
  };
  return { store, log, records };
}

const blob = (bytes: number, type = "application/octet-stream") => new Blob([new Uint8Array(bytes)], { type });
const base = { bucket: "b", key: "dir/file.bin", connection: { id: "c1", endpoint: "https://s3.example.test" } };
const pool = () => new RequestPool(() => 4);

describe("part sizing (technical-spec 7)", () => {
  it("is 8 MiB until the file is big, then grows in whole MiB", () => {
    expect(partSizeFor(16 * MIB)).toBe(8 * MIB);
    expect(partSizeFor(500 * MIB)).toBe(8 * MIB);
    expect(partSizeFor(100 * 1024 * MIB)).toBe(12 * MIB);
    expect(partSizeFor(100 * 1024 * MIB) % MIB).toBe(0);
  });

  it("never needs more than 10,000 parts up to the 5 TiB limit", () => {
    for (const size of [16 * MIB, 80 * 1024 * MIB, 1024 ** 4, MAX_OBJECT_BYTES]) {
      expect(Math.ceil(size / partSizeFor(size))).toBeLessThanOrEqual(MAX_PARTS);
    }
  });
});

describe("AC-41.4 small files", () => {
  it("uploads below 16 MiB with one PutObject and reports full progress", async () => {
    const { client, calls } = fake();
    const progress: number[] = [];
    await uploadObject({ ...base, client, body: blob(1024, "text/plain"), pool: pool(), store: memoryStore().store, onProgress: (n) => progress.push(n) });
    expect(calls.map((call) => call.name)).toEqual(["PutObject"]);
    expect(calls[0]?.input).toMatchObject({ Bucket: "b", Key: "dir/file.bin", ContentType: "text/plain" });
    expect(progress).toEqual([1024]);
  });

  it("uploads an empty file", async () => {
    const { client, calls } = fake();
    await uploadObject({ ...base, client, body: blob(0, ""), pool: pool(), store: memoryStore().store });
    expect(calls.map((call) => call.name)).toEqual(["PutObject"]);
    expect(calls[0]?.input).not.toHaveProperty("ContentType");
  });
});

describe("AC-41.1 multipart", () => {
  it("creates, stores the record before the first part, uploads every part and completes with parts sorted", async () => {
    // Later parts finish first, so completion must sort them.
    const { client, calls } = fake({
      UploadPart: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 30 - Number(input.PartNumber) * 5));
        return { ETag: `"e${String(input.PartNumber)}"` };
      },
    });
    const { store, log, records } = memoryStore();
    const progress: number[] = [];
    await uploadObject({ ...base, client, body: blob(40 * MIB), pool: pool(), store, id: "t1", onProgress: (n) => progress.push(n) });

    const names = calls.map((call) => call.name);
    expect(names[0]).toBe("CreateMultipartUpload");
    expect(names.filter((n) => n === "UploadPart")).toHaveLength(5);
    expect(names.at(-1)).toBe("CompleteMultipartUpload");
    // The record was written after Create and before any UploadPart.
    expect(log[0]).toBe("put");
    const complete = calls.at(-1)?.input as { MultipartUpload: { Parts: { PartNumber: number; ETag: string }[] } };
    expect(complete.MultipartUpload.Parts.map((part) => part.PartNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(complete.MultipartUpload.Parts[0]?.ETag).toBe('"e1"');
    expect(log.at(-1)).toBe("delete");
    expect(records.size).toBe(0);
    expect(progress.at(-1)).toBe(40 * MIB);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("slices parts of the part size, the last one shorter", async () => {
    const sizes: number[] = [];
    const { client } = fake({ UploadPart: (input) => { sizes.push((input.Body as Uint8Array).byteLength); return { ETag: '"x"' }; } });
    await uploadObject({ ...base, client, body: blob(20 * MIB), pool: pool(), store: memoryStore().store });
    expect(sizes.sort((a, b) => b - a)).toEqual([8 * MIB, 8 * MIB, 4 * MIB]);
  });

  it("keeps at most the pool limit of parts in flight", async () => {
    let active = 0;
    let peak = 0;
    const { client } = fake({
      UploadPart: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { ETag: '"x"' };
      },
    });
    await uploadObject({ ...base, client, body: blob(80 * MIB), pool: new RequestPool(() => 2), store: memoryStore().store });
    expect(peak).toBe(2);
  });

  it("rejects an object over 5 TiB before any request", async () => {
    const { client, calls } = fake();
    const huge = { size: MAX_OBJECT_BYTES + 1, type: "", slice: () => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) };
    await expect(uploadObject({ ...base, client, body: huge, pool: pool(), store: memoryStore().store })).rejects.toMatchObject({ code: "quota" });
    expect(calls).toEqual([]);
  });
});

describe("AC-41.2 and AC-41.3 failure and cancel", () => {
  it("aborts the multipart upload and drops the record when a part fails", async () => {
    const { client, calls } = fake({ UploadPart: (input) => { if (input.PartNumber === 2) throw Object.assign(new Error("x"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } }); return { ETag: '"x"' }; } });
    const { store, records } = memoryStore();
    const error = await uploadObject({ ...base, client, body: blob(40 * MIB), pool: pool(), store }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("accessDenied");
    expect(calls.map((call) => call.name)).toContain("AbortMultipartUpload");
    expect(calls.map((call) => call.name)).not.toContain("CompleteMultipartUpload");
    expect(calls.find((call) => call.name === "AbortMultipartUpload")?.input).toMatchObject({ UploadId: "up-1" });
    expect(records.size).toBe(0);
  });

  it("aborts at the provider when the signal fires mid-upload", async () => {
    const controller = new AbortController();
    const { client, calls } = fake({
      UploadPart: async (input) => {
        if (input.PartNumber === 1) controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ETag: '"x"' };
      },
    });
    const { store, records } = memoryStore();
    const error = await uploadObject({ ...base, client, body: blob(40 * MIB), pool: pool(), store, signal: controller.signal }).catch((caught: unknown) => caught);
    expect((error as AppError).code).toBe("aborted");
    expect(calls.map((call) => call.name)).toContain("AbortMultipartUpload");
    expect(records.size).toBe(0);
  });

  it("keeps the record when the abort itself fails, so the next load retries it", async () => {
    const { client } = fake({
      UploadPart: () => { throw Object.assign(new Error("x"), { name: "InternalError", $metadata: { httpStatusCode: 500 } }); },
      AbortMultipartUpload: () => { throw Object.assign(new Error("x"), { name: "InternalError", $metadata: { httpStatusCode: 500 } }); },
    });
    const { store, records } = memoryStore();
    await expect(uploadObject({ ...base, client, body: blob(20 * MIB), pool: pool(), store })).rejects.toBeInstanceOf(AppError);
    expect(records.size).toBe(1);
  });

  it("fails and aborts when a part comes back without an ETag", async () => {
    const { client, calls } = fake({ UploadPart: () => ({}) });
    const error = await uploadObject({ ...base, client, body: blob(20 * MIB), pool: pool(), store: memoryStore().store }).catch((caught: unknown) => caught);
    expect((error as AppError).code).toBe("cors");
    expect(calls.map((call) => call.name)).toContain("AbortMultipartUpload");
  });

  it("a throttled part halves the pool and is tried again", async () => {
    const shared = pool();
    const { client } = fake({
      UploadPart: (_input, call) => {
        if (call === 1) throw Object.assign(new Error("x"), { name: "SlowDown", $metadata: { httpStatusCode: 503 } });
        return { ETag: '"x"' };
      },
    });
    await uploadObject({ ...base, client, body: blob(20 * MIB), pool: shared, store: memoryStore().store });
    expect(shared.limit).toBe(2);
  });
});

describe("RequestPool", () => {
  it("runs queued tasks in order as slots free up", async () => {
    const order: number[] = [];
    const shared = new RequestPool(() => 1);
    await Promise.all([1, 2, 3].map((n) => shared.run(async () => { order.push(n); await Promise.resolve(); })));
    expect(order).toEqual([1, 2, 3]);
  });

  it("drops a waiting task whose signal aborts, without taking a slot", async () => {
    const shared = new RequestPool(() => 1);
    let release: () => void = () => undefined;
    const first = shared.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new AbortController();
    const second = shared.run(() => Promise.resolve("never"), controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    release();
    await first;
    await expect(shared.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("halves the limit while throttled and restores it after", () => {
    let now = 0;
    const shared = new RequestPool(() => 6, () => now);
    expect(shared.limit).toBe(6);
    shared.throttle(30_000);
    expect(shared.limit).toBe(3);
    now = 30_001;
    expect(shared.limit).toBe(6);
  });

  it("never goes below one", () => {
    const shared = new RequestPool(() => 1);
    shared.throttle();
    expect(shared.limit).toBe(1);
  });
});
