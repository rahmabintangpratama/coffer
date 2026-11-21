import { create } from "zustand";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";

interface SessionState {
  /** The active connection without its keys. The keys are only in lib/storage/vault. */
  connection: ConnectionSummary | null;
  connect: (connection: ConnectionSummary) => void;
  disconnect: () => void;
}

export const useSession = create<SessionState>((set) => ({
  connection: null,
  connect: (connection) => {
    set({ connection });
  },
  disconnect: () => {
    set({ connection: null });
  },
}));

// A lock drops the keys, so the session cannot keep pointing at a connection that has none (M8 adds the unlock path).
vault.onLock(() => {
  useSession.getState().disconnect();
});
