import type { JournalEntry } from "@/lib/types";
import { sharedDb, type UploadRecord } from "./db";

/** Everything this browser keeps about one connection besides its sealed keys (OQ-37, C-55). */
export interface ConnectionData {
  /** Moves, copies, trashes and restores that are not finished or discarded. */
  unfinished: JournalEntry[];
  uploads: UploadRecord[];
  starred: number;
  recent: number;
}

/** Every key of a store whose first key part is the connection id. */
const OWN = (connectionId: string) => IDBKeyRange.bound([connectionId], [connectionId, []]);

export async function dataOf(connectionId: string): Promise<ConnectionData> {
  const handle = await sharedDb();
  const [journal, uploads, starred, recent] = await Promise.all([
    handle.getAll("journal"),
    handle.getAll("uploads"),
    handle.count("starred", OWN(connectionId)),
    handle.count("recent", OWN(connectionId)),
  ]);
  return {
    unfinished: journal.filter((entry) => entry.connectionId === connectionId && (entry.status === "running" || entry.status === "interrupted" || entry.status === "paused")),
    uploads: uploads.filter((record) => record.connectionId === connectionId),
    starred,
    recent,
  };
}

/**
 * Delete the journal, upload, Starred and Recent rows of one connection in one transaction: all of them or none. The
 * sealed profile is deleted by `vault.remove`. Other connections' rows are not touched.
 */
export async function purgeConnectionData(connectionId: string): Promise<void> {
  const handle = await sharedDb();
  const tx = handle.transaction(["journal", "uploads", "starred", "recent"], "readwrite");
  const done: Promise<unknown>[] = [];
  for (const entry of await tx.objectStore("journal").getAll()) if (entry.connectionId === connectionId) done.push(tx.objectStore("journal").delete(entry.id));
  for (const record of await tx.objectStore("uploads").getAll()) if (record.connectionId === connectionId) done.push(tx.objectStore("uploads").delete(record.id));
  for (const store of ["starred", "recent"] as const) {
    for (const key of await tx.objectStore(store).getAllKeys(OWN(connectionId))) done.push(tx.objectStore(store).delete(key));
  }
  await Promise.all([...done, tx.done]);
}
