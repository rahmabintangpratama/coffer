import { DeleteObjectCommand, HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { JournalEntry } from "@/lib/types";
import { advance, finish, type JournalStore, planned } from "@/lib/storage/journal";
import { copyObject } from "./copy";
import { AppError, toAppError } from "./errors";
import { type ObjectInfo, countUnder, listUnder } from "./list-all";
import { RequestPool } from "./pool";

/** Objects of one operation copy in parallel, up to this many (technical-spec 8, Concurrency). */
export const OPERATION_CONCURRENCY = 4;
const PERSIST_EVERY_OBJECTS = 25;
const PERSIST_EVERY_MS = 2000;
const SMALL_OPERATION = 25;
const RETRIES = 3;

export interface OperationOptions {
  client: S3Client;
  journal: JournalStore;
  entry: JournalEntry;
  signal?: AbortSignal;
  /** Called after each persisted step with the new entry (the transfer panel's progress). */
  onProgress?: (entry: JournalEntry) => void;
  /** Lowered by tests (technical-spec 15.1). */
  copySingleLimit?: number;
  copyPartSize?: number;
  now?: () => Date;
}

interface Remote {
  size: number;
  etag: string;
  encrypted: boolean;
}

const isNotFound = (error: unknown) => toAppError(error).code === "noSuchKey";
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function head(client: S3Client, bucket: string, key: string, signal?: AbortSignal): Promise<Remote | null> {
  try {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), signal ? { abortSignal: signal } : undefined);
    return { size: response.ContentLength ?? 0, etag: (response.ETag ?? "").replaceAll('"', ""), encrypted: response.ServerSideEncryption === "aws:kms" || response.SSECustomerAlgorithm !== undefined };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw toAppError(error);
  }
}

/**
 * Rule 2 of technical-spec 8: the target has the source's length and, when ETags are
 * comparable (neither is a multipart ETag, nothing is encrypted so they can differ), its ETag.
 */
export function verifies(source: ObjectInfo, target: Remote): boolean {
  if (target.size !== source.size) return false;
  const comparable = !source.etag.includes("-") && !target.etag.includes("-") && !target.encrypted && source.etag !== "" && target.etag !== "";
  return !comparable || source.etag === target.etag;
}

/** The target key of a source key: the same suffix under the target prefix, or the target key itself for one object. */
export function targetKeyOf(entry: Pick<JournalEntry, "source" | "target">, sourceKey: string): string {
  const target = entry.target ?? sourceKey;
  return entry.source.endsWith("/") ? `${target}${sourceKey.slice(entry.source.length)}` : target;
}

/** A folder cannot move into itself, and a key cannot move onto itself. */
function assertSane(entry: JournalEntry): void {
  if (entry.target === undefined) throw new AppError("conflict");
  if (entry.target === entry.source) throw new AppError("conflict");
  if (entry.source.endsWith("/") && entry.target.startsWith(entry.source)) throw new AppError("conflict");
}

/**
 * Run a move, rename or copy from its journal entry, write-ahead (technical-spec 8,
 * NFR-9). The entry is stored before the first request. Per object: copy, verify, and only
 * then delete the source; a failed verify never deletes. Progress and the cursor are stored
 * every 25 objects or 2 s (after every object for a small operation). A resume re-lists from
 * the cursor and trusts nothing in memory: if a target already exists and verifies, the
 * crash was between verify and delete, so only the delete is left; otherwise it copies afresh.
 * Returns the final entry: `done`, or `interrupted` with the failures named.
 */
export async function runOperation(options: OperationOptions): Promise<JournalEntry> {
  const { client, journal, signal } = options;
  const now = options.now ?? (() => new Date());
  let entry = options.entry;
  assertSane(entry);
  const bucket = entry.bucket;
  const deletesSource = entry.kind !== "copy";
  const isFolder = entry.source.endsWith("/");

  // Rule 1: nothing is requested before this write.
  await journal.put(entry);

  if (entry.phase === "planning") {
    const total = isFolder ? await countUnder(client, { bucket, prefix: entry.source, signal }) : 1;
    entry = planned(entry, total, now());
    await journal.put(entry);
    options.onProgress?.(entry);
  }

  const pool = new RequestPool(() => OPERATION_CONCURRENCY);
  const failures: { key: string; code: string }[] = [];
  let done = entry.done;
  let cursor = entry.cursor;
  // After a failure the cursor stops: a resume lists from it again, so the failed object (whose source still exists) is reached
  // and every object done meanwhile is not (its source is gone).
  let blocked = false;
  let sincePersist = 0;
  let lastPersist = Date.now();

  const persist = async (force: boolean) => {
    sincePersist += 1;
    const due = force || entry.total <= SMALL_OPERATION || sincePersist >= PERSIST_EVERY_OBJECTS || Date.now() - lastPersist >= PERSIST_EVERY_MS;
    if (!due) return;
    sincePersist = 0;
    lastPersist = Date.now();
    entry = advance(entry, { done, cursor }, now());
    await journal.put(entry);
    options.onProgress?.(entry);
  };

  const processObject = async (item: ObjectInfo): Promise<void> => {
    const targetKey = targetKeyOf(entry, item.key);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const existing = await head(client, bucket, targetKey, signal);
        // Rule 4: a target that already verifies is the result of the copy before a crash.
        if (!existing || !verifies(item, existing)) {
          await copyObject(client, { bucket, sourceKey: item.key, targetKey, size: item.size, ...(options.copySingleLimit === undefined ? {} : { singleLimit: options.copySingleLimit }), ...(options.copyPartSize === undefined ? {} : { partSize: options.copyPartSize }), ...(signal ? { signal } : {}) });
          const copied = await head(client, bucket, targetKey, signal);
          if (!copied || !verifies(item, copied)) throw new AppError("unknown");
        }
        // Only now, with the copy verified, may the source go (AC-45.5).
        if (deletesSource) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.key }), signal ? { abortSignal: signal } : undefined);
        return;
      } catch (error) {
        const app = toAppError(error);
        if (app.code === "throttled" && attempt < RETRIES - 1) {
          pool.throttle();
          await wait(500 * 2 ** attempt);
          continue;
        }
        throw app;
      }
    }
  };

  const sources: AsyncIterable<ObjectInfo[]> = isFolder
    ? listUnder(client, { bucket, prefix: entry.source, startAfter: entry.cursor, signal })
    : (async function* () {
        const info = await head(client, bucket, entry.source, signal);
        if (info) yield [{ key: entry.source, size: info.size, etag: info.etag }];
      })();

  const handlePage = async (page: ObjectInfo[]) => {
    // Within a page objects run in parallel; the cursor moves over the keys done in order.
    const finished = new Array<boolean>(page.length).fill(false);
    let contiguous = 0;
    await Promise.all(
      page.map((item, index) =>
        pool.run(async () => {
          try {
            await processObject(item);
            done += 1;
            finished[index] = true;
            while (contiguous < page.length && finished[contiguous]) {
              if (!blocked) cursor = page[contiguous]?.key;
              contiguous += 1;
            }
          } catch (error) {
            if (signal?.aborted) throw error;
            blocked = true;
            failures.push({ key: item.key, code: toAppError(error).code });
          }
          await persist(false);
        }, signal),
      ),
    );
  };

  try {
    for await (const page of sources) await handlePage(page);
  } catch (error) {
    // A cancel or a crash-like failure leaves the entry resumable, with what is done kept.
    entry = { ...advance(entry, { done, cursor }, now()), status: "interrupted" };
    await journal.put(entry);
    options.onProgress?.(entry);
    if (signal?.aborted) return entry;
    throw toAppError(error);
  }

  // Objects done between the last write and a crash left no trace but their missing source, so a clean finish counts them all.
  entry = finish(advance(entry, { done: failures.length === 0 ? entry.total : done, cursor }, now()), failures, now());
  await journal.put(entry);
  options.onProgress?.(entry);
  return entry;
}
