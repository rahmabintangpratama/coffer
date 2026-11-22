import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { ConnectionProfile, JournalEntry } from "@/lib/types";

export const DB_NAME = "coffer";

/** A stored multipart upload (technical-spec 7). Never file bytes, never keys: only what the provider needs to abort or resume. */
export interface UploadRecord {
  id: string;
  connectionId: string;
  /** The provider endpoint and bucket, so a later session can tell which connection can abort this upload. */
  endpoint: string;
  bucket: string;
  key: string;
  uploadId: string;
  partSize: number;
  size: number;
  /** Finished parts with their ETags, kept from the start so v1 resume needs no schema change. */
  parts: { partNumber: number; etag: string }[];
  startedAt: string;
}

export interface CofferDb extends DBSchema {
  /** Saved connections: the profile with its keys sealed by the vault (ADR-005). Never a `memory` profile. */
  connections: { key: string; value: ConnectionProfile };
  journal: { key: string; value: JournalEntry };
  uploads: { key: string; value: UploadRecord };
  starred: { key: [string, string, string]; value: { connectionId: string; bucket: string; key: string } };
  recent: { key: [string, string, string]; value: { connectionId: string; bucket: string; key: string } };
  meta: { key: string; value: { key: string; value: unknown } };
}

type Upgrade = (db: IDBPDatabase<CofferDb>) => void;

/**
 * One step per schema version, applied in order. A change is a new step at the
 * end, additive only: never drop a store or a field silently (lib/storage
 * AGENTS.md). The migration test opens each earlier version and upgrades it.
 */
export const migrations: readonly Upgrade[] = [
  (db) => {
    db.createObjectStore("connections", { keyPath: "id" });
    db.createObjectStore("journal", { keyPath: "id" });
    db.createObjectStore("uploads", { keyPath: "id" });
    db.createObjectStore("starred", { keyPath: ["connectionId", "bucket", "key"] });
    db.createObjectStore("recent", { keyPath: ["connectionId", "bucket", "key"] });
    db.createObjectStore("meta", { keyPath: "key" });
  },
];

export const LATEST_VERSION = migrations.length;

/** Open the database, upgrading it to `version` (default: the latest). The test harness passes an older version to build old data. */
export function openCoffer(name: string = DB_NAME, version: number = LATEST_VERSION): Promise<IDBPDatabase<CofferDb>> {
  return openDB<CofferDb>(name, version, {
    upgrade(db, oldVersion) {
      for (let step = oldVersion; step < version; step += 1) migrations[step]?.(db);
    },
  });
}

let shared: Promise<IDBPDatabase<CofferDb>> | null = null;
let sealed = false;

/**
 * The one open handle every store in this module shares, so "Forget this device" can close it before deleting the
 * database. It closes itself when another tab deletes or upgrades the database, which would otherwise block that
 * (the other tab's Forget). After `sealDb` it refuses to open again: a tab that is going away must not recreate
 * what was just removed.
 */
export function sharedDb(): Promise<IDBPDatabase<CofferDb>> {
  if (sealed) return Promise.reject(new Error("storage was removed"));
  if (!shared) {
    const opening = openCoffer();
    shared = opening;
    void opening.then(
      (handle) => {
        handle.addEventListener("versionchange", () => {
          handle.close();
          if (shared === opening) shared = null;
        });
      },
      () => {
        if (shared === opening) shared = null;
      },
    );
  }
  return shared;
}

/** Close the shared handle. A later `sharedDb()` opens a new one unless the database was sealed. */
export async function closeSharedDb(): Promise<void> {
  const opening = shared;
  shared = null;
  if (opening) (await opening.catch(() => null))?.close();
}

/** After Forget: close the handle and refuse to open the database again in this page. */
export async function sealDb(): Promise<void> {
  sealed = true;
  await closeSharedDb();
}

/** Tests only: allow opening again after `sealDb`. */
export function unsealDbForTests(): void {
  sealed = false;
}
