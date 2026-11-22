/**
 * Tells the other tabs of this origin that the vault was locked or the device was forgotten, so they follow within
 * a moment (FR-9, FR-10), and that the person is active, so the auto-lock timers of all tabs run on one clock (AC-9.8). BroadcastChannel is used where it exists; elsewhere a short-lived `localStorage` write
 * raises a `storage` event in the other tabs (the writing tab never gets its own).
 *
 * An `activity` message only says "someone is using Coffer", so an idle tab does not lock a tab that is in use.
 * A message is only a type and a flag. It never carries a key, a credential, a passphrase or the derived key:
 * each tab holds its own, and unlocking in one tab does not unlock another.
 */
export type TabMessage = { type: "lock"; stop: boolean } | { type: "forget" } | { type: "activity" };

/** Not storage: the name of the channel. */
export const CHANNEL_NAME = "coffer:vault";
/** The `localStorage` key of the fallback signal. It holds a type and a nonce, and is removed again at once. */
export const SIGNAL_KEY = "coffer:signal";

interface Envelope {
  id: string;
  from: string;
  message: TabMessage;
}

export interface TabSyncDeps {
  /** A BroadcastChannel, or null where there is none. */
  channel: Pick<BroadcastChannel, "postMessage" | "close"> & { onmessage: ((event: MessageEvent) => void) | null } | null;
  storage: Pick<Storage, "setItem" | "removeItem"> | null;
  /** Where `storage` events arrive (the window). */
  events: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  /** Replaced by tests. */
  newId?: () => string;
}

export interface TabSync {
  /** Tell the other tabs. */
  post: (message: TabMessage) => void;
  /** Listen for messages from other tabs; returns the way to stop. */
  subscribe: (handler: (message: TabMessage) => void) => () => void;
}

const isMessage = (value: unknown): value is TabMessage => {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { type?: unknown; stop?: unknown };
  if (message.type === "forget" || message.type === "activity") return true;
  return message.type === "lock" && typeof message.stop === "boolean";
};

const parseEnvelope = (value: unknown): Envelope | null => {
  if (typeof value !== "object" || value === null) return null;
  const envelope = value as { id?: unknown; from?: unknown; message?: unknown };
  if (typeof envelope.id !== "string" || typeof envelope.from !== "string" || !isMessage(envelope.message)) return null;
  return { id: envelope.id, from: envelope.from, message: envelope.message };
};

export function createTabSync(deps: TabSyncDeps): TabSync {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const self = newId();
  const handlers = new Set<(message: TabMessage) => void>();
  const seen = new Set<string>();

  const receive = (envelope: Envelope | null) => {
    if (!envelope || envelope.from === self || seen.has(envelope.id)) return;
    seen.add(envelope.id);
    handlers.forEach((handler) => {
      handler(envelope.message);
    });
  };

  if (deps.channel) {
    deps.channel.onmessage = (event) => {
      receive(parseEnvelope(event.data));
    };
  } else {
    deps.events?.addEventListener("storage", (event) => {
      const change = event as StorageEvent;
      if (change.key !== SIGNAL_KEY || change.newValue === null) return;
      try {
        receive(parseEnvelope(JSON.parse(change.newValue)));
      } catch {
        // Not ours; ignore.
      }
    });
  }

  return {
    post: (message) => {
      const envelope: Envelope = { id: newId(), from: self, message };
      if (deps.channel) {
        deps.channel.postMessage(envelope);
        return;
      }
      try {
        deps.storage?.setItem(SIGNAL_KEY, JSON.stringify(envelope));
        deps.storage?.removeItem(SIGNAL_KEY);
      } catch {
        // No storage, no other tabs to tell.
      }
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

let shared: TabSync | null = null;

/** The page's own instance, made on first use from the browser's channel or its storage events. */
export function tabSync(): TabSync {
  if (shared) return shared;
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
  const storage = ((): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  shared = createTabSync({ channel, storage, events: typeof window === "undefined" ? null : window });
  return shared;
}
