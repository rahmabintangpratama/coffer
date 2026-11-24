import { DB_NAME } from "./db";

/**
 * The local data inventory (SECURITY-DESIGN 5, technical-spec 11.5, ADR-007). It is the single list of what Coffer
 * keeps in this browser. "What's stored on this device" reads it, "Forget this device" clears every line of it, and
 * `inventory.test.ts` fails when source code touches browser storage in a file that is not named here. A new storage
 * location is added here, to What's stored and to Forget in the same change.
 */
export type StorageKind = "indexeddb" | "localStorage" | "sessionStorage" | "cache" | "serviceWorker" | "memory";

export interface InventoryItem {
  id: string;
  kind: StorageKind;
  /** The database and store, the key, or "memory". */
  where: string;
  encrypted: boolean;
  /** Source files that read or write it. The inventory test checks every use of a storage API against these. */
  files: readonly string[];
}

export const DATABASE_NAME = DB_NAME;
export const LOCAL_STORAGE_PREFIX = "coffer:";

export const INVENTORY: readonly InventoryItem[] = [
  { id: "connections", kind: "indexeddb", where: `${DATABASE_NAME}/connections`, encrypted: true, files: ["src/lib/storage/db.ts", "src/lib/storage/connection-store.ts"] },
  { id: "journal", kind: "indexeddb", where: `${DATABASE_NAME}/journal`, encrypted: false, files: ["src/lib/storage/db.ts", "src/lib/storage/journal-store.ts", "src/lib/storage/connection-data.ts"] },
  { id: "uploads", kind: "indexeddb", where: `${DATABASE_NAME}/uploads`, encrypted: false, files: ["src/lib/storage/db.ts", "src/lib/storage/uploads.ts", "src/lib/storage/connection-data.ts"] },
  { id: "starred", kind: "indexeddb", where: `${DATABASE_NAME}/starred`, encrypted: false, files: ["src/lib/storage/db.ts", "src/lib/storage/connection-data.ts"] },
  { id: "recent", kind: "indexeddb", where: `${DATABASE_NAME}/recent`, encrypted: false, files: ["src/lib/storage/db.ts", "src/lib/storage/connection-data.ts"] },
  { id: "meta", kind: "indexeddb", where: `${DATABASE_NAME}/meta`, encrypted: false, files: ["src/lib/storage/db.ts"] },
  { id: "settings", kind: "localStorage", where: "coffer:settings", encrypted: false, files: ["src/app/settings.ts"] },
  { id: "theme", kind: "localStorage", where: "coffer:theme", encrypted: false, files: ["src/app/theme.ts", "public/theme-init.js"] },
  { id: "saved-hint", kind: "localStorage", where: "coffer:saved", encrypted: false, files: ["src/lib/storage/hint.ts"] },
  { id: "tab-signal", kind: "localStorage", where: "coffer:signal", encrypted: false, files: ["src/lib/storage/tabsync.ts"] },
  { id: "session", kind: "sessionStorage", where: "sessionStorage", encrypted: false, files: [] },
  { id: "cache", kind: "cache", where: "Cache Storage", encrypted: false, files: [] },
  { id: "service-worker", kind: "serviceWorker", where: "service worker registrations", encrypted: false, files: [] },
  { id: "keys", kind: "memory", where: "memory", encrypted: false, files: ["src/lib/storage/vault.ts"] },
];

/**
 * Files that use a browser API that is not storage (the channel name, Web Locks) and so are not inventory lines.
 * Each is listed so a new one is a decision, not an accident.
 */
export const NON_STORAGE_FILES: readonly string[] = ["src/lib/storage/locks.ts", "src/lib/storage/forget.ts", "src/lib/storage/inventory.ts", "src/lib/storage/vault.ts"];

/** The localStorage keys the inventory knows. */
export const KNOWN_LOCAL_KEYS: readonly string[] = INVENTORY.filter((item) => item.kind === "localStorage").map((item) => item.where);
