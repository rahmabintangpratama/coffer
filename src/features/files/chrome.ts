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
  /** The search pill's placeholder: it names exactly what the pill searches (the folder, or the top of the bucket). */
  searchPlaceholder: string;
  filters: Filters;
  selectedCount: number;
  selectionActions: SelectionAction[];
  /** The shell's sidebar is collapsed to icons: New, which Files puts at its top, shows only its icon. */
  sidebarCollapsed: boolean;
  activate: (searchPlaceholder: string) => void;
  deactivate: () => void;
  setFilters: (filters: Filters) => void;
  setSelection: (count: number, actions: SelectionAction[]) => void;
}

export const useFilesChrome = create<FilesChromeState>((set) => ({
  active: false,
  searchPlaceholder: "",
  filters: noFilters,
  selectedCount: 0,
  selectionActions: [],
  sidebarCollapsed: false,
  activate: (searchPlaceholder) => { set({ active: true, searchPlaceholder }); },
  // Leaving a folder drops its search and filters, as the screen's state always did.
  deactivate: () => { set({ active: false, filters: noFilters, selectedCount: 0, selectionActions: [] }); },
  setFilters: (filters) => { set({ filters }); },
  setSelection: (selectedCount, selectionActions) => { set({ selectedCount, selectionActions }); },
}));

