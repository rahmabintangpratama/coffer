import { closeSharedDb, sealDb, sharedDb } from "./db";
import { DATABASE_NAME, OWNED_PREFIX } from "./inventory";
import { isUnfinished } from "./journal";
import { heldOperationIds } from "./locks";
import { vault } from "./vault";

export interface ForgetDeps {
  /** Replaced by tests. */
  indexedDB?: IDBFactory;
  localStorage?: Storage;
  sessionStorage?: Storage;
  caches?: CacheStorage;
  serviceWorker?: ServiceWorkerContainer;
  /** The address the app is served under, such as `https://host/coffer/`: the only service worker scope that is Coffer's. */
  scope?: string;
  /** How long to wait for other tabs to close their handles before the delete is left pending (it still completes). */
  blockedMs?: number;
}

const safe = async (task: () => unknown): Promise<void> => {
  try {
    await task();
  } catch {
    // One location failing to clear must not stop the others; the inventory test proves each is covered.
  }
};

function deleteOwnDatabase(factory: IDBFactory, blockedMs: number): Promise<void> {
  return new Promise((resolve) => {
    const request = factory.deleteDatabase(DATABASE_NAME);
    // Another tab that still has the database open gets a versionchange event and closes; until then the delete is "blocked".
    // It completes by itself when they close, so a timeout only stops this call from waiting.
    const timer = setTimeout(resolve, blockedMs);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onsuccess = done;
    request.onerror = done;
  });
}

function removeOwnedKeys(storage: Storage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(OWNED_PREFIX)) storage.removeItem(key);
  }
}

const ownScope = (): string | undefined => (typeof location === "undefined" ? undefined : new URL(import.meta.env.BASE_URL, location.origin).href);

/**
 * Forget this device (FR-10, technical-spec 9): stop running transfers and their leases, close the database
 * handle, delete the database, the `coffer:` keys of both web storages, the `coffer:` caches and the service worker
 * registered for the app's own base, then drop the keys held in memory. Nothing clears a whole store: an origin can
 * hold other apps, and their data stays (C-61). The caller clears the query cache and reloads to Welcome.
 * Buckets and files are not touched.
 */
export async function forgetDevice(deps: ForgetDeps = {}): Promise<void> {
  await stopEverything();
  await safe(sealDb);
  await safe(() => deleteOwnDatabase(deps.indexedDB ?? indexedDB, deps.blockedMs ?? 3000));
  await safe(() => { removeOwnedKeys(deps.localStorage ?? window.localStorage); });
  await safe(() => { removeOwnedKeys(deps.sessionStorage ?? window.sessionStorage); });
  await safe(async () => {
    const storage = deps.caches ?? (typeof caches === "undefined" ? undefined : caches);
    if (!storage) return;
    for (const name of await storage.keys()) if (name.startsWith(OWNED_PREFIX)) await storage.delete(name);
  });
  await safe(async () => {
    const container = deps.serviceWorker ?? (typeof navigator === "undefined" ? undefined : navigator.serviceWorker);
    const scope = deps.scope ?? ownScope();
    if (!container || scope === undefined) return;
    for (const registration of await container.getRegistrations()) if (registration.scope === scope) await registration.unregister();
  });
  vault.lock();
}

/** How long Forget waits for aborted transfers to finish cleaning up at the provider (AbortMultipartUpload) before it goes on. */
const SETTLE_MS = 5000;

/**
 * The keys go first. Then every running and every waiting transfer is stopped, and Forget waits for the stopped ones to
 * release their lease, which is after they aborted their multipart uploads: the upload records are about to be deleted,
 * so nothing could clean them up later.
 */
async function stopEverything(): Promise<void> {
  vault.lock();
  vault.stopLeases({ includeWaiting: true });
  await vault.leasesSettled(SETTLE_MS);
}

/** The same for a tab that was told by another tab: close the handle and refuse to reopen, without deleting twice. */
export async function releaseStorage(): Promise<void> {
  await stopEverything();
  await safe(closeSharedDb);
  await safe(sealDb);
}

export interface StoredReport {
  connections: number;
  /** Interrupted operations only (the copy says "interrupted moves"); finished entries kept for Undo are not counted. */
  journal: number;
  starred: number;
  recent: number;
  uploads: number;
}

/** Counts for "What's stored on this device" (AC-101.2), read from the database. */
export async function storedReport(): Promise<StoredReport> {
  const handle = await sharedDb();
  const [connections, entries, held, starred, recent, uploads] = await Promise.all([
    handle.count("connections"),
    handle.getAll("journal"),
    heldOperationIds(),
    handle.count("starred"),
    handle.count("recent"),
    handle.count("uploads"),
  ]);
  const journal = entries.filter((entry) => isUnfinished(entry, held)).length;
  return { connections, journal, starred, recent, uploads };
}
