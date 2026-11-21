import { create } from "zustand";
import type { SelectionAction } from "@/components/SelectionBar";
import { type Filters, noFilters } from "./model";

/**
 * What the Files screen puts into the app bar (design: the search pill and filter
 * chips live there, and the selection bar replaces it while items are selected).
 * The screen writes, the app bar reads. It holds names and callbacks, never bucket
 * contents. Small and free of heavy imports: the app bar is in the first bundle.
 */
interface FilesChromeState {
  /** The Files route is showing and the app bar should carry its controls. */
  active: boolean;
  folderLabel: string;
  filters: Filters;
  selectedCount: number;
  selectionActions: SelectionAction[];
  activate: (folderLabel: string) => void;
  deactivate: () => void;
  setFilters: (filters: Filters) => void;
  setSelection: (count: number, actions: SelectionAction[]) => void;
}

export const useFilesChrome = create<FilesChromeState>((set) => ({
  active: false,
  folderLabel: "",
  filters: noFilters,
  selectedCount: 0,
  selectionActions: [],
  activate: (folderLabel) => { set({ active: true, folderLabel }); },
  // Leaving a folder drops its search and filters, as the screen's state always did.
  deactivate: () => { set({ active: false, filters: noFilters, selectedCount: 0, selectionActions: [] }); },
  setFilters: (filters) => { set({ filters }); },
  setSelection: (selectedCount, selectionActions) => { set({ selectedCount, selectionActions }); },
}));

