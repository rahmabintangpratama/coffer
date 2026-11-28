import { create } from "zustand";
import { savedHint } from "@/lib/storage/hint";
import type { ConnectionSummary } from "@/lib/types";

/** Why the keys are not available: the app opened with saved connections, or a lock (here, or in another tab). */
export interface LockState {
  reason: "start" | "manual" | "auto" | "remote";
  /** The auto-lock setting that fired, for "It locked after N minutes away". */
  minutes?: number;
  /** The saved connection to open after the unlock, when one was chosen in the switcher. */
  connectionId?: string;
  /** The active connection when it was only in memory: its keys are gone and nothing saved can bring them back. */
  memoryOnly?: ConnectionSummary;
}

interface SessionState {
  /** The active connection without its keys. The keys are only in lib/storage/vault. */
  connection: ConnectionSummary | null;
  /** Saved connections opened by the last unlock (summaries, never keys), for the switcher. */
  saved: ConnectionSummary[];
  /** Set while the keys are locked; the Unlock screen shows. Null otherwise. */
  locked: LockState | null;
  /** "Add connection": onboarding runs over the current session, which is kept. */
  adding: boolean;
  /** Onboarding opens at the form for this memory-only connection, with its non-secret values kept. */
  resuming: ConnectionSummary | null;
  /** "Edit connection": the saved connection being edited, over the current session. */
  editing: ConnectionSummary | null;
  startEditing: (connection: ConnectionSummary) => void;
  stopEditing: () => void;
  connect: (connection: ConnectionSummary) => void;
  disconnect: () => void;
  setSaved: (saved: ConnectionSummary[]) => void;
  /** The keys are gone: show Unlock. The active connection is remembered so the same one opens again (AC-9.5). */
  lock: (state: LockState) => void;
  /** Unlock succeeded: back to the connection that was active, or the given one. */
  unlocked: (connection: ConnectionSummary, saved: ConnectionSummary[]) => void;
  /** Leave Unlock without unlocking ("Use a different connection", or a stale hint). */
  leaveLock: () => void;
  startAdding: () => void;
  /** "Enter the keys again" on the memory-only Locked screen. */
  startReenter: (connection: ConnectionSummary) => void;
  stopAdding: () => void;
}

export const useSession = create<SessionState>((set) => ({
  connection: null,
  saved: [],
  // A device with saved connections opens on Unlock; the hint avoids opening IndexedDB for the first paint.
  locked: savedHint() ? { reason: "start" } : null,
  adding: false,
  resuming: null,
  editing: null,
  startEditing: (connection) => {
    set({ editing: connection });
  },
  stopEditing: () => {
    set({ editing: null });
  },
  connect: (connection) => {
    set({ connection, adding: false, resuming: null, locked: null });
  },
  disconnect: () => {
    set({ connection: null });
  },
  setSaved: (saved) => {
    set({ saved });
  },
  // A tab that is adding a connection keeps its onboarding open: the form clears its own keys, and the lock shows when it ends.
  lock: (locked) => {
    set({ locked, editing: null });
  },
  unlocked: (connection, saved) => {
    set({ connection, saved, locked: null, adding: false, resuming: null });
  },
  leaveLock: () => {
    set({ locked: null, connection: null, adding: false, resuming: null, editing: null });
  },
  startAdding: () => {
    set({ adding: true });
  },
  startReenter: (connection) => {
    set({ adding: true, resuming: connection });
  },
  stopAdding: () => {
    set({ adding: false, resuming: null });
  },
}));
