import type { ConnectionProfile, ConnectionSummary, Credentials } from "@/lib/types";
import { connectionStore } from "./connection-store";
import { deriveKey, type KdfParams, needsRehash, newKdfParams, open, paramsOf, type SealedCredentials, seal } from "./crypto";
import { setSavedHint } from "./hint";

/**
 * The only place decrypted credentials live (ADR-005). Memory-only connections keep their keys in `secrets` and lose
 * them on reload. Saved connections are sealed in IndexedDB; unlocking derives the key once from the passphrase and
 * caches it here as a non-extractable `CryptoKey`. Nothing outside this file keeps a key: callers get a copy per
 * request through `credentialsFor`, or a private lease for a running transfer.
 *
 * Neither the key nor the credentials are ever written to storage, logged, or posted to another tab.
 */

/** Thrown when a connection's keys are not available (locked, forgotten or never added). */
export class LockedError extends Error {
  constructor() {
    super("locked");
    this.name = "LockedError";
  }
}

/** The passphrase did not open the saved connections. */
export { WrongPassphraseError } from "./crypto";

const secrets = new Map<string, Credentials>();
let cachedKey: CryptoKey | null = null;
let cachedParams: KdfParams | null = null;

const lockListeners = new Set<() => void>();
const unlockListeners = new Set<() => void>();
const emit = (listeners: Set<() => void>) => {
  listeners.forEach((listener) => {
    listener();
  });
};

const copy = (credentials: Credentials): Credentials => ({
  accessKeyId: credentials.accessKeyId,
  secretAccessKey: credentials.secretAccessKey,
  ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }),
});

const sealedOf = (profile: ConnectionProfile): SealedCredentials => {
  const { credentials } = profile;
  if (credentials.storage !== "encrypted") throw new Error("not an encrypted profile");
  return { v: credentials.v, cipher: credentials.cipher, kdf: credentials.kdf, iterations: credentials.iterations, salt: credentials.salt, iv: credentials.iv, data: credentials.data };
};

/** The profile without its sealed record: what the rest of the app may hold. */
const summaryOf = (profile: ConnectionProfile): ConnectionSummary => Object.fromEntries(Object.entries(profile).filter(([field]) => field !== "credentials")) as ConnectionSummary;

/** A running transfer's private copy of the keys (C-27). It survives a lock and ends with the transfer. */
export interface Lease {
  readonly connectionId: string;
  readonly credentials: Credentials;
  /** Aborts when "Stop transfers and lock" or Forget stops the leases. */
  readonly signal: AbortSignal;
  release: () => void;
}

interface Waiter {
  connectionId: string;
  resolve: (lease: Lease) => void;
  reject: (error: Error) => void;
  signal: AbortSignal | undefined;
  onAbort: () => void;
}

const leases = new Set<{ lease: Lease; controller: AbortController }>();
const waiters = new Set<Waiter>();
const leaseListeners = new Set<() => void>();

const abortError = () => new DOMException("aborted", "AbortError");

function makeLease(connectionId: string): Lease {
  const source = secrets.get(connectionId);
  if (!source) throw new LockedError();
  const controller = new AbortController();
  const entry = { controller, lease: undefined as unknown as Lease };
  const lease: Lease = {
    connectionId,
    credentials: copy(source),
    signal: controller.signal,
    release: () => {
      if (leases.delete(entry)) emit(leaseListeners);
    },
  };
  entry.lease = lease;
  leases.add(entry);
  emit(leaseListeners);
  return lease;
}

function serveWaiters(): void {
  for (const waiter of [...waiters]) {
    if (!secrets.has(waiter.connectionId)) continue;
    waiters.delete(waiter);
    waiter.signal?.removeEventListener("abort", waiter.onAbort);
    waiter.resolve(makeLease(waiter.connectionId));
  }
}

/** Adopt a key that opened the first record: open every record with it, keep the keys and the key. */
async function adopt(key: CryptoKey, params: KdfParams, profiles: readonly ConnectionProfile[]): Promise<ConnectionSummary[]> {
  const opened = new Map<string, Credentials>();
  const readable: ConnectionProfile[] = [];
  for (const profile of profiles) {
    try {
      opened.set(profile.id, await open(key, profile.id, sealedOf(profile)));
      readable.push(profile);
    } catch {
      // A record made under another salt cannot be opened with this key; it stays in the store, locked.
    }
  }
  for (const [id, credentials] of opened) secrets.set(id, credentials);
  cachedKey = key;
  cachedParams = params;
  emit(unlockListeners);
  serveWaiters();
  return readable.map(summaryOf);
}

export const vault = {
  /** Keep the keys for a connection (a copy). */
  put(connectionId: string, credentials: Credentials): void {
    secrets.set(connectionId, copy(credentials));
    serveWaiters();
  },

  has(connectionId: string): boolean {
    return secrets.has(connectionId);
  },

  /** Whether the connection signs with a session token. Tells the Share dialog about the cap without handing out the token. */
  hasSessionToken(connectionId: string): boolean {
    return secrets.get(connectionId)?.sessionToken !== undefined;
  },

  /** The keys for one request. Rejects with LockedError when they are not there. */
  credentialsFor(connectionId: string): Promise<Credentials> {
    const credentials = secrets.get(connectionId);
    return credentials ? Promise.resolve(copy(credentials)) : Promise.reject(new LockedError());
  },

  forget(connectionId: string): void {
    secrets.delete(connectionId);
  },

  /** True while a passphrase has been entered in this tab and the saved connections are open. */
  isUnlocked(): boolean {
    return cachedKey !== null;
  },

  /** Summaries of the saved connections (never their keys), for Unlock, the switcher and Settings. */
  async saved(): Promise<ConnectionSummary[]> {
    return (await connectionStore.list()).map(summaryOf);
  },

  async savedCount(): Promise<number> {
    return connectionStore.count();
  },

  /**
   * Save a connection that is in memory. The first save sets the passphrase. Later saves reuse the cached key while
   * unlocked; when locked the passphrase must open the existing records first, so one passphrase protects all.
   */
  async save(summary: ConnectionSummary, passphrase?: string): Promise<void> {
    const credentials = secrets.get(summary.id);
    if (!credentials) throw new LockedError();
    let key = cachedKey;
    let params = cachedParams;
    if (!key || !params) {
      if (passphrase === undefined) throw new LockedError();
      const existing = await connectionStore.list();
      const first = existing[0];
      if (first) {
        params = paramsOf(sealedOf(first));
        key = await deriveKey(passphrase, params);
        // Throws WrongPassphraseError when it is not the passphrase of the saved connections.
        await open(key, first.id, sealedOf(first));
        await adopt(key, params, existing);
      } else {
        params = newKdfParams();
        key = await deriveKey(passphrase, params);
        cachedKey = key;
        cachedParams = params;
        emit(unlockListeners);
      }
    }
    const sealed = await seal(key, summary.id, credentials, params);
    const profile: ConnectionProfile = { ...summary, lastUsedAt: new Date().toISOString(), credentials: { storage: "encrypted", ...sealed } };
    await connectionStore.put(profile);
    setSavedHint(true);
  },

  /**
   * Open the saved connections with the passphrase. Rejects with WrongPassphraseError when it does not match. A
   * record made below the current work factor is sealed again under a fresh salt (ADR-005).
   */
  async unlock(passphrase: string): Promise<ConnectionSummary[]> {
    const profiles = await connectionStore.list();
    const first = profiles[0];
    if (!first) return [];
    const sealed = sealedOf(first);
    const params = paramsOf(sealed);
    const key = await deriveKey(passphrase, params);
    await open(key, first.id, sealed);
    if (!needsRehash(sealed)) return adopt(key, params, profiles);
    // Sealed below the current work factor: open every record with the old key, seal each again under a fresh salt.
    const freshParams = newKdfParams();
    const freshKey = await deriveKey(passphrase, freshParams);
    const rewritten: ConnectionProfile[] = [];
    for (const profile of profiles) {
      try {
        const credentials = await open(key, profile.id, sealedOf(profile));
        const next: ConnectionProfile = { ...profile, credentials: { storage: "encrypted", ...(await seal(freshKey, profile.id, credentials, freshParams)) } };
        await connectionStore.put(next);
        rewritten.push(next);
      } catch {
        rewritten.push(profile);
      }
    }
    return adopt(freshKey, freshParams, rewritten);
  },

  /** Note which saved connection was used last, so Unlock opens the same one next time. */
  async touch(connectionId: string): Promise<void> {
    const profile = await connectionStore.get(connectionId);
    if (profile) await connectionStore.put({ ...profile, lastUsedAt: new Date().toISOString() });
  },

  /**
   * The secret key of a saved connection, for Show secret key (FR-102). The passphrase is derived again for this
   * one call: the cached key is not used, so proving presence means typing it. The result is for display only.
   */
  async reveal(connectionId: string, passphrase: string): Promise<string> {
    const profile = await connectionStore.get(connectionId);
    if (!profile) throw new LockedError();
    const sealed = sealedOf(profile);
    const credentials = await open(await deriveKey(passphrase, paramsOf(sealed)), connectionId, sealed);
    return credentials.secretAccessKey;
  },

  /** Delete one saved connection and its keys (AC-11.4). Others stay. */
  async remove(connectionId: string): Promise<void> {
    await connectionStore.delete(connectionId);
    secrets.delete(connectionId);
    if ((await connectionStore.count()) === 0) {
      setSavedHint(false);
      cachedKey = null;
      cachedParams = null;
    }
  },

  /** Drop the key and every key held here, then tell listeners. Running leases are left alone (C-27). */
  lock(): void {
    secrets.clear();
    cachedKey = null;
    cachedParams = null;
    emit(lockListeners);
  },

  onLock(listener: () => void): () => void {
    lockListeners.add(listener);
    return () => lockListeners.delete(listener);
  },

  onUnlock(listener: () => void): () => void {
    unlockListeners.add(listener);
    return () => unlockListeners.delete(listener);
  },

  /** A private copy of a connection's keys for one running transfer. Throws LockedError while locked. */
  lease(connectionId: string): Lease {
    return makeLease(connectionId);
  },

  /** Like `lease`, but while locked it waits for the unlock (queued transfers). Rejects with AbortError when stopped. */
  leaseWhenUnlocked(connectionId: string, signal?: AbortSignal): Promise<Lease> {
    if (secrets.has(connectionId)) return Promise.resolve(makeLease(connectionId));
    return new Promise<Lease>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const waiter: Waiter = {
        connectionId,
        resolve,
        reject,
        signal,
        onAbort: () => {
          waiters.delete(waiter);
          reject(abortError());
        },
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      waiters.add(waiter);
    });
  },

  /** How many transfers hold a lease right now (the Locked screen's banner). */
  leaseCount(): number {
    return leases.size;
  },

  onLeaseChange(listener: () => void): () => void {
    leaseListeners.add(listener);
    return () => leaseListeners.delete(listener);
  },

  /** Cancel every running transfer and every waiting one: "Stop transfers and lock" and Forget (C-38). */
  stopLeases(): void {
    for (const waiter of [...waiters]) {
      waiters.delete(waiter);
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      waiter.reject(abortError());
    }
    for (const { controller } of [...leases]) controller.abort();
  },
};
