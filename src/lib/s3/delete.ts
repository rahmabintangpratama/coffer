import { DeleteObjectCommand, DeleteObjectsCommand, type S3Client } from "@aws-sdk/client-s3";
import { AppError, type AppErrorCode, toAppError } from "./errors";
import { listUnder } from "./list-all";

/** DeleteObjects takes at most this many keys per request. */
export const DELETE_BATCH = 1000;

export interface DeleteFailure {
  key: string;
  code: AppErrorCode;
}

export interface DeleteResult {
  deleted: number;
  failed: DeleteFailure[];
}

export interface DeleteOptions {
  bucket: string;
  signal?: AbortSignal | undefined;
  /** After each batch: how many keys are done, failures included. */
  onProgress?: ((done: number) => void) | undefined;
}

async function deleteOne(client: S3Client, bucket: string, key: string, signal?: AbortSignal): Promise<DeleteFailure | null> {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), signal ? { abortSignal: signal } : undefined);
    return null;
  } catch (error) {
    const app = toAppError(error);
    // A key that is already gone is what was asked for.
    return app.code === "noSuchKey" ? null : { key, code: app.code };
  }
}

/**
 * Delete keys in batches of up to 1,000 with DeleteObjects (AC-71.3). A provider that rejects the
 * request itself (not a per-key error) gets one DeleteObject per key instead. A key that fails is
 * listed and the rest continue.
 */
export async function deleteKeys(client: S3Client, keys: readonly string[], options: DeleteOptions): Promise<DeleteResult> {
  const failed: DeleteFailure[] = [];
  let deleted = 0;
  let single = false;
  for (let start = 0; start < keys.length; start += DELETE_BATCH) {
    if (options.signal?.aborted) throw new AppError("aborted");
    const batch = keys.slice(start, start + DELETE_BATCH);
    let batchFailed: DeleteFailure[] | null = null;
    if (!single) {
      try {
        const response = await client.send(
          new DeleteObjectsCommand({ Bucket: options.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
          options.signal ? { abortSignal: options.signal } : undefined,
        );
        batchFailed = (response.Errors ?? []).map((error) => ({ key: error.Key ?? "", code: error.Code === "AccessDenied" ? "accessDenied" : "unknown" }));
      } catch (error) {
        const app = toAppError(error);
        // Connection, auth and throttling problems would fail one by one as well: report them. Anything else is a
        // provider that does not take the batch call.
        if (["aborted", "network", "cors", "accessDenied", "expiredToken", "signature", "clockSkew", "throttled", "noSuchBucket"].includes(app.code)) throw app;
        single = true;
      }
    }
    if (batchFailed === null) {
      batchFailed = [];
      for (const key of batch) {
        const failure = await deleteOne(client, options.bucket, key, options.signal);
        if (failure) batchFailed.push(failure);
      }
    }
    failed.push(...batchFailed);
    deleted += batch.length - batchFailed.length;
    options.onProgress?.(start + batch.length);
  }
  return { deleted, failed };
}

/**
 * Every key under a prefix, a page at a time: list a page, delete it, and list the next page after its
 * last key (Empty trash, a whole batch). The cursor moves past keys that failed, so they are listed once
 * as failures and do not stop the rest.
 */
export async function deleteUnder(client: S3Client, prefix: string, options: DeleteOptions): Promise<DeleteResult> {
  const failed: DeleteFailure[] = [];
  let deleted = 0;
  let done = 0;
  let cursor: string | undefined;
  for (;;) {
    let page: string[] = [];
    for await (const objects of listUnder(client, { bucket: options.bucket, prefix, startAfter: cursor, signal: options.signal })) {
      page = objects.map((object) => object.key);
      break;
    }
    const last = page[page.length - 1];
    if (last === undefined) break;
    const result = await deleteKeys(client, page, { bucket: options.bucket, signal: options.signal });
    deleted += result.deleted;
    failed.push(...result.failed);
    done += page.length;
    options.onProgress?.(done);
    cursor = last;
  }
  return { deleted, failed };
}
