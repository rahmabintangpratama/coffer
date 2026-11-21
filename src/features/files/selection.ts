import { create } from "zustand";

interface SelectionState {
  /** Keys of the selected items. */
  keys: ReadonlySet<string>;
  /** The item a Shift-click range starts from. */
  anchor: string | null;
  /** Mobile selection mode: on after a long press, until the selection is cleared. */
  active: boolean;
  set: (key: string) => void;
  toggle: (key: string) => void;
  range: (key: string, order: readonly string[]) => void;
  selectAll: (order: readonly string[]) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set, get) => ({
  keys: new Set(),
  anchor: null,
  active: false,
  set: (key) => {
    set({ keys: new Set([key]), anchor: key, active: true });
  },
  toggle: (key) => {
    const keys = new Set(get().keys);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    set({ keys, anchor: key, active: keys.size > 0 });
  },
  range: (key, order) => {
    const { anchor } = get();
    const from = anchor === null ? -1 : order.indexOf(anchor);
    const to = order.indexOf(key);
    if (from < 0 || to < 0) {
      get().set(key);
      return;
    }
    const [start, end] = from < to ? [from, to] : [to, from];
    set({ keys: new Set(order.slice(start, end + 1)), active: true });
  },
  selectAll: (order) => {
    set({ keys: new Set(order), active: order.length > 0 });
  },
  clear: () => {
    set({ keys: new Set(), anchor: null, active: false });
  },
}));
