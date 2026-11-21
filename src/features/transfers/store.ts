import { create } from "zustand";

export type TransferStatus = "queued" | "running" | "done" | "failed";

export interface Transfer {
  id: string;
  name: string;
  /** The folder it goes into, for the row's second line. */
  folder: string;
  size: number;
  bytesDone: number;
  status: TransferStatus;
  /** An AppError code when it failed. */
  error?: string;
}

/** An upload that was running when the page closed and has been aborted at the provider (C-43). */
export interface InterruptedUpload {
  id: string;
  name: string;
}

/** A move, rename or copy running in the background (FR-44: "Moving “{name}”" with progress). */
export interface OperationRow {
  id: string;
  name: string;
  done: number;
  total: number;
}

interface TransferState {
  operations: OperationRow[];
  setOperation: (row: OperationRow) => void;
  removeOperation: (id: string) => void;
  transfers: Transfer[];
  interrupted: InterruptedUpload[];
  collapsed: boolean;
  add: (transfers: Transfer[]) => void;
  patch: (id: string, patch: Partial<Transfer>) => void;
  remove: (id: string) => void;
  clearDone: () => void;
  addInterrupted: (items: InterruptedUpload[]) => void;
  dismissInterrupted: (id: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  reset: () => void;
}

export const useTransfers = create<TransferState>((set) => ({
  operations: [],
  setOperation: (row) => { set((state) => ({ operations: state.operations.some((existing) => existing.id === row.id) ? state.operations.map((existing) => (existing.id === row.id ? row : existing)) : [...state.operations, row], collapsed: false })); },
  removeOperation: (id) => { set((state) => ({ operations: state.operations.filter((row) => row.id !== id) })); },
  transfers: [],
  interrupted: [],
  collapsed: false,
  add: (transfers) => { set((state) => ({ transfers: [...state.transfers, ...transfers], collapsed: false })); },
  patch: (id, patch) => { set((state) => ({ transfers: state.transfers.map((transfer) => (transfer.id === id ? { ...transfer, ...patch } : transfer)) })); },
  remove: (id) => { set((state) => ({ transfers: state.transfers.filter((transfer) => transfer.id !== id) })); },
  clearDone: () => { set((state) => ({ transfers: state.transfers.filter((transfer) => transfer.status !== "done") })); },
  addInterrupted: (items) => { set((state) => ({ interrupted: [...state.interrupted, ...items], collapsed: false })); },
  dismissInterrupted: (id) => { set((state) => ({ interrupted: state.interrupted.filter((item) => item.id !== id) })); },
  setCollapsed: (collapsed) => { set({ collapsed }); },
  reset: () => { set({ transfers: [], interrupted: [], operations: [], collapsed: false }); },
}));
