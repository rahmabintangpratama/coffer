import type { Credentials } from "@/lib/types";

/**
 * The only place decrypted credentials live. For now it is memory only: keys
 * disappear on reload or tab close (the "Not now" choice). The encrypted saved
 * mode, auto-lock and credential leases arrive in M8 on top of this module
 * (ADR-005). Nothing outside this file keeps a key: callers get a copy, per
 * request, through credentialsFor.
 */

/** Thrown when a connection's keys are not available (locked, forgotten or never added). */
export class LockedError extends Error {
  constructor() {
    super("locked");
    this.name = "LockedError";
  }
}

const secrets = new Map<string, Credentials>();
const lockListeners = new Set<() => void>();

const copy = (credentials: Credentials): Credentials => ({
  accessKeyId: credentials.accessKeyId,
  secretAccessKey: credentials.secretAccessKey,
  ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }),
});

export const vault = {
  /** Keep the keys for a connection (a copy). */
  put(connectionId: string, credentials: Credentials): void {
    secrets.set(connectionId, copy(credentials));
  },

  has(connectionId: string): boolean {
    return secrets.has(connectionId);
  },

  /** The keys for one request. Rejects with LockedError when they are not there. */
  credentialsFor(connectionId: string): Promise<Credentials> {
    const credentials = secrets.get(connectionId);
    return credentials ? Promise.resolve(copy(credentials)) : Promise.reject(new LockedError());
  },

  forget(connectionId: string): void {
    secrets.delete(connectionId);
  },

  /** Drop every key and tell listeners. */
  lock(): void {
    secrets.clear();
    lockListeners.forEach((listener) => {
      listener();
    });
  },

  onLock(listener: () => void): () => void {
    lockListeners.add(listener);
    return () => lockListeners.delete(listener);
  },
};
