import { create } from "zustand";
import type { JournalEntry } from "@/lib/types";

interface OperationsState {
  /** Entries that were cut off (or ended with failures) and wait for Resume, Review or Discard. */
  interrupted: JournalEntry[];
  setInterrupted: (entries: JournalEntry[]) => void;
  upsertInterrupted: (entry: JournalEntry) => void;
  removeInterrupted: (id: string) => void;
}

export const useOperations = create<OperationsState>((set) => ({
  interrupted: [],
  setInterrupted: (interrupted) => { set({ interrupted }); },
  upsertInterrupted: (entry) => { set((state) => ({ interrupted: state.interrupted.some((existing) => existing.id === entry.id) ? state.interrupted.map((existing) => (existing.id === entry.id ? entry : existing)) : [...state.interrupted, entry] })); },
  removeInterrupted: (id) => { set((state) => ({ interrupted: state.interrupted.filter((entry) => entry.id !== id) })); },
}));

/** A lock drops the list; it is read again from the journal when the app opens again. */
export const clearInterruptedOperations = (): void => { useOperations.getState().setInterrupted([]); };
