import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  type S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { AppError, toAppError } from "./errors";
import type { RequestPool } from "./pool";

export const MIB = 1024 * 1024;
/** Below this one PutObject; from it, multipart (technical-spec 7). */
export const MULTIPART_THRESHOLD = 16 * MIB;
export const MAX_PARTS = 10_000;
export const MAX_OBJECT_BYTES = 5 * 1024 ** 4;
const THROTTLE_RETRIES = 3;

/** Part size: `max(8 MiB, ceil(size / 9000))` rounded up to the next MiB, which keeps the part count under 10,000. */
export function partSizeFor(size: number): number {
  return Math.max(8 * MIB, Math.ceil(Math.ceil(size / 9000) / MIB) * MIB);
}

/** What the orchestrator needs from a File: its size, a type and slices that can be read as bytes. A Blob fits. */
export interface UploadBody {
  readonly size: number;
  readonly type: string;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

/** A stored multipart upload. The shape lib/storage implements; lib/s3 only names it (src/AGENTS.md layers). */
export interface UploadRecord {
  id: string;
  connectionId: string;
  endpoint: string;
  bucket: string;
  key: string;
  uploadId: string;
  partSize: number;
  size: number;
  parts: { partNumber: number; etag: string }[];
  startedAt: string;
}

/** Implemented by lib/storage (the `uploads` store) and injected, so lib/storage never imports lib/s3. */
export interface UploadStateStore {
  put(record: UploadRecord): Promise<void>;
  addPart(id: string, part: { partNumber: number; etag: string }): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface UploadOptions {
  client: S3Client;
  bucket: string;
  key: string;
  body: UploadBody;
  pool: RequestPool;
  store: UploadStateStore;
  /** Which connection this belongs to, and its endpoint, kept in the record so a later session can abort it. */
  connection: { id: string; endpoint: string };
  signal?: AbortSignal;
  /** Bytes finished so far; called per finished part (fetch has no upload progress). */
  onProgress?: (bytesDone: number) => void;
  /** A stable record id (a transfer id). Defaults to a random one. */
  id?: string;
}

const randomId = () => crypto.randomUUID();
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
  });

/** Run a request; on throttling halve the pool for a while and try again, a few times. */
async function withThrottleRetry<T>(pool: RequestPool, signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const app = toAppError(error);
      if (app.code !== "throttled" || attempt >= THROTTLE_RETRIES - 1) throw app;
      pool.throttle();
      await wait(500 * 2 ** attempt, signal);
    }
  }
}

/**
 * Upload one object (ADR-009, technical-spec 7). Below 16 MiB: one PutObject.
 * From 16 MiB: CreateMultipartUpload, the record is stored before the first
 * part, parts go through the shared pool, then CompleteMultipartUpload with the
 * parts sorted. Any failure or cancel aborts the multipart upload at the
 * provider; if that abort fails the record stays so the next load retries it.
 */
export async function uploadObject(options: UploadOptions): Promise<void> {
  const { client, bucket, key, body, pool, store, signal } = options;
  if (body.size > MAX_OBJECT_BYTES) throw new AppError("quota");
  const abortOption = signal ? { abortSignal: signal } : undefined;

  if (body.size < MULTIPART_THRESHOLD) {
    try {
      await pool.run(
        async () => {
          const bytes = new Uint8Array(await body.slice(0, body.size).arrayBuffer());
          await withThrottleRetry(pool, signal, () =>
            client.send(
              new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ...(body.type === "" ? {} : { ContentType: body.type }) }),
              abortOption,
            ),
          );
        },
        signal,
      );
      options.onProgress?.(body.size);
      return;
    } catch (error) {
      throw toAppError(error);
    }
  }

  const partSize = partSizeFor(body.size);
  const count = Math.ceil(body.size / partSize);
  if (count > MAX_PARTS) throw new AppError("unsupported");

  let uploadId: string;
  try {
    const created = await client.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ...(body.type === "" ? {} : { ContentType: body.type }) }),
      abortOption,
    );
    if (created.UploadId === undefined) throw new AppError("unsupported");
    uploadId = created.UploadId;
  } catch (error) {
    throw toAppError(error);
  }

  const record: UploadRecord = {
    id: options.id ?? randomId(),
    connectionId: options.connection.id,
    endpoint: options.connection.endpoint,
    bucket,
    key,
    uploadId,
    partSize,
    size: body.size,
    parts: [],
    startedAt: new Date().toISOString(),
  };

  // The record exists before the first part, so a crash at any later point leaves something that can be aborted.
  try {
    await store.put(record);
  } catch (error) {
    await abortUpload(client, { bucket, key, uploadId }).catch(() => undefined);
    throw toAppError(error);
  }

  // One controller stops the other parts as soon as one fails, and follows the caller's signal.
  const inner = new AbortController();
  const onOuterAbort = () => { inner.abort(); };
  if (signal?.aborted) inner.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  const done: { PartNumber: number; ETag: string }[] = [];
  let bytesDone = 0;
  try {
    await Promise.all(
      Array.from({ length: count }, (_, index) => {
        const partNumber = index + 1;
        const start = index * partSize;
        const end = Math.min(start + partSize, body.size);
        return pool
          .run(async () => {
            const bytes = new Uint8Array(await body.slice(start, end).arrayBuffer());
            const response = await withThrottleRetry(pool, inner.signal, () =>
              client.send(
                new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: bytes }),
                { abortSignal: inner.signal },
              ),
            );
            // Without the ETag the upload cannot be completed; a CORS rule that does not expose it is the usual cause.
            if (response.ETag === undefined) throw new AppError("cors");
            done.push({ PartNumber: partNumber, ETag: response.ETag });
            await store.addPart(record.id, { partNumber, etag: response.ETag });
            bytesDone += end - start;
            options.onProgress?.(bytesDone);
          }, inner.signal)
          .catch((error: unknown) => {
            inner.abort();
            throw error;
          });
      }),
    );
    done.sort((a, b) => a.PartNumber - b.PartNumber);
    await client.send(
      new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: done } }),
      abortOption,
    );
    await store.delete(record.id);
  } catch (error) {
    inner.abort();
    // Parts may still be in flight; none of them matters once the upload is aborted below.
    try {
      await abortUpload(client, { bucket, key, uploadId });
      await store.delete(record.id);
    } catch {
      // Keep the record: the next load retries the abort (technical-spec 7).
    }
    throw signal?.aborted ? new AppError("aborted") : toAppError(error);
  } finally {
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Abort a multipart upload at the provider. An upload that is already gone counts
 * as aborted. Used on cancel, on failure and by the app's abort-on-load (C-43).
 */
export async function abortUpload(client: S3Client, target: { bucket: string; key: string; uploadId: string }): Promise<void> {
  try {
    await client.send(new AbortMultipartUploadCommand({ Bucket: target.bucket, Key: target.key, UploadId: target.uploadId }));
  } catch (error) {
    const app = toAppError(error);
    if (app.code === "noSuchKey") return;
    throw app;
  }
}
