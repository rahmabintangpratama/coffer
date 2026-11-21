import { type DBSchema, type IDBPDatabase, openDB } from "idb";

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
  connections: { key: string; value: { id: string } };
  journal: { key: string; value: { id: string } };
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
