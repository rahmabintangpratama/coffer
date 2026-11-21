/**
 * Web Locks around running uploads. IndexedDB is shared by every tab, so a record
 * in the `uploads` store can belong to an upload that is still running in another
 * tab. Each running upload holds the lock `coffer-upload:<record id>` for its
 * whole life; abort-on-load skips a record whose lock is held, because aborting it
 * would destroy a live upload (D-36).
 */
export const UPLOAD_LOCK_PREFIX = "coffer-upload:";

const locks = (): LockManager | undefined => (typeof navigator === "undefined" ? undefined : navigator.locks);

/** Run `task` while holding the lock for `id`. Without the Web Locks API the task still runs, unprotected. */
export async function withUploadLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const manager = locks();
  if (!manager) return task();
  return manager.request(`${UPLOAD_LOCK_PREFIX}${id}`, task);
}

/**
 * Record ids whose upload lock is held right now, in this tab or another. Returns
 * null when the lock state cannot be read (no Web Locks API): the caller then
 * cannot tell a live upload from a dead one.
 */
export async function heldUploadIds(): Promise<ReadonlySet<string> | null> {
  const manager = locks();
  if (!manager) return null;
  const state = await manager.query();
  const held = new Set<string>();
  for (const lock of state.held ?? []) {
    if (lock.name?.startsWith(UPLOAD_LOCK_PREFIX)) held.add(lock.name.slice(UPLOAD_LOCK_PREFIX.length));
  }
  return held;
}

/** The prefix of the lock a running operation (move, rename, copy) holds on its journal entry. */
export const OPERATION_LOCK_PREFIX = "coffer-op:";

/**
 * Run `task` while holding the lock for operation `id`. The journal is shared by every
 * tab, so a running entry in it may belong to another tab; on load only entries whose
 * lock is free count as interrupted (D-41, the same rule as uploads in D-36).
 */
export async function withOperationLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const manager = locks();
  if (!manager) return task();
  return manager.request(`${OPERATION_LOCK_PREFIX}${id}`, task);
}

/**
 * Like `withOperationLock`, but never waits: when another tab (or this one) holds the lock the task
 * does not run and the result says so. Resume uses it so two tabs cannot both run one entry (D-41).
 * Without the Web Locks API the task runs, unprotected.
 */
export async function tryOperationLock<T>(id: string, task: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
  const manager = locks();
  if (!manager) return { ran: true, value: await task() };
  return manager.request(`${OPERATION_LOCK_PREFIX}${id}`, { ifAvailable: true }, async (lock) => (lock ? { ran: true as const, value: await task() } : { ran: false as const }));
}

/** Entry ids whose operation lock is held right now, here or in another tab; null when the lock state cannot be read. */
export async function heldOperationIds(): Promise<ReadonlySet<string> | null> {
  const manager = locks();
  if (!manager) return null;
  const state = await manager.query();
  const held = new Set<string>();
  for (const lock of state.held ?? []) {
    if (lock.name?.startsWith(OPERATION_LOCK_PREFIX)) held.add(lock.name.slice(OPERATION_LOCK_PREFIX.length));
  }
  return held;
}
