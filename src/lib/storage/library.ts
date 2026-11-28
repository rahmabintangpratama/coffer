import type { FileKind, RecentItem, StarredItem } from "@/lib/types";
import { sharedDb } from "./db";

/**
 * Starred (FR-80) and Recent (FR-81): local lists in IndexedDB, keyed by connection, bucket
 * and object key. Nothing here is read from or written to the bucket; "Forget this device"
 * and removing the connection clear them (AC-81.3, C-55).
 */

/** AC-81 edge case: Recent keeps the 50 latest per connection. */
export const RECENT_LIMIT = 50;

const range = (connectionId: string, bucket: string) => IDBKeyRange.bound([connectionId, bucket], [connectionId, bucket, []]);

export async function listStarred(connectionId: string, bucket: string): Promise<StarredItem[]> {
  const items = await (await sharedDb()).getAll("starred", range(connectionId, bucket));
  return items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function addStars(items: readonly Omit<StarredItem, "addedAt">[], now: Date = new Date()): Promise<void> {
  const tx = (await sharedDb()).transaction("starred", "readwrite");
  await Promise.all([...items.map((item) => tx.store.put({ ...item, addedAt: now.toISOString() })), tx.done]);
}

export async function removeStars(connectionId: string, bucket: string, keys: readonly string[]): Promise<void> {
  const tx = (await sharedDb()).transaction("starred", "readwrite");
  await Promise.all([...keys.map((key) => tx.store.delete([connectionId, bucket, key])), tx.done]);
}

/**
 * AC-80.2: after a move or rename through Coffer the stars under `source` follow to `target`;
 * after a trash (`target` null) they are removed. A folder source ends in "/" and carries
 * the stars of everything under it.
 */
export async function followStars(connectionId: string, bucket: string, source: string, target: string | null): Promise<void> {
  const tx = (await sharedDb()).transaction("starred", "readwrite");
  const work: Promise<unknown>[] = [];
  for (const item of await tx.store.getAll(range(connectionId, bucket))) {
    const hit = source.endsWith("/") ? item.key.startsWith(source) : item.key === source;
    if (!hit) continue;
    work.push(tx.store.delete([connectionId, bucket, item.key]));
    if (target !== null) work.push(tx.store.put({ ...item, key: target + item.key.slice(source.length) }));
  }
  await Promise.all([...work, tx.done]);
}

export async function listRecent(connectionId: string, bucket: string): Promise<RecentItem[]> {
  const items = await (await sharedDb()).getAll("recent", range(connectionId, bucket));
  return items.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

/** AC-81.1: a file opened in Preview goes to the top of Recent; past the limit the oldest drop. */
export async function recordRecent(item: { connectionId: string; bucket: string; key: string; name: string; fileKind: FileKind }, now: Date = new Date()): Promise<void> {
  const tx = (await sharedDb()).transaction("recent", "readwrite");
  await tx.store.put({ ...item, openedAt: now.toISOString() });
  const all = (await tx.store.getAll(IDBKeyRange.bound([item.connectionId], [item.connectionId, []]))).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  await Promise.all([...all.slice(RECENT_LIMIT).map((old) => tx.store.delete([old.connectionId, old.bucket, old.key])), tx.done]);
}

export async function clearRecent(connectionId: string, bucket: string): Promise<void> {
  await (await sharedDb()).delete("recent", range(connectionId, bucket));
}
