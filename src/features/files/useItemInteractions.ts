import { type KeyboardEvent, type MouseEvent, type PointerEvent, useCallback, useMemo, useRef, useState } from "react";
import type { LayoutMode } from "@/components/layout";
import type { FolderItem } from "@/lib/types";
import type { Item } from "./model";
import { useSelection } from "./selection";
import { type ItemShortcut, itemShortcutOf } from "./shortcuts";

const LONG_PRESS_MS = 450;

export interface InteractionOptions {
  items: readonly Item[];
  layout: LayoutMode;
  onOpenFolder: (folder: FolderItem) => void;
  /** A file was activated (Enter, Space, or a tap outside selection mode on a phone): it opens in the preview. */
  onActivateFile: (item: Item) => void;
  /** Where focus goes for an arrow key: the screen scrolls the item into view and focuses it. */
  focusIndex: (index: number) => void;
  /** Maps an arrow key to the next index. Lists move by one; the grid also moves by a row. */
  nextIndex: (current: number, key: string) => number | null;
  onSearchShortcut: () => void;
  /** Called for a right-click, Shift+F10 or the Menu key on an item; return false when it has no menu. */
  onContextItem: (item: Item) => boolean;
  /** F2/N, M, S, I, Del or Backspace on an item: the screen runs it on the selection, or on this item when nothing is selected (FR-26). */
  onShortcut: (action: ItemShortcut, item: Item) => void;
}

/**
 * Click, keyboard and long-press behavior shared by the list and the grid
 * (FR-30, AC-20.5). Pointer: click selects, Ctrl/Cmd toggles, Shift ranges,
 * double-click opens a folder or previews a file. Touch: a long press starts selection mode, then
 * taps toggle; outside it a tap opens a folder or the details of a file.
 */
export function useItemInteractions(options: InteractionOptions) {
  const { items, layout, onOpenFolder, onActivateFile, focusIndex, nextIndex, onSearchShortcut, onContextItem, onShortcut } = options;
  const [focused, setFocused] = useState(0);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const order = useMemo(() => items.map((item) => item.key), [items]);
  const selection = useSelection;

  const clampedFocus = Math.min(focused, Math.max(0, items.length - 1));

  const click = useCallback(
    (event: MouseEvent, item: Item) => {
      if (press.current?.fired) {
        press.current = null;
        return;
      }
      const state = selection.getState();
      if (event.shiftKey) {
        state.range(item.key, order);
      } else if (event.metaKey || event.ctrlKey) {
        state.toggle(item.key);
      } else if (layout === "compact") {
        if (state.keys.size > 0) state.toggle(item.key);
        else if (item.kind === "folder") onOpenFolder(item);
        else onActivateFile(item);
      } else {
        state.set(item.key);
      }
    },
    [layout, onActivateFile, onOpenFolder, order, selection],
  );

  const keyDown = useCallback(
    (event: KeyboardEvent, item: Item, index: number) => {
      const state = selection.getState();
      const shortcut = itemShortcutOf(event);
      if (shortcut) {
        event.preventDefault();
        onShortcut(shortcut, item);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (item.kind === "folder") onOpenFolder(item);
        else onActivateFile(item);
      } else if (event.key === " ") {
        event.preventDefault();
        // Space previews a file (ux-patterns); with Shift it ranges and with Ctrl or Cmd it toggles.
        if (event.shiftKey) state.range(item.key, order);
        else if (event.metaKey || event.ctrlKey || item.kind === "folder") state.toggle(item.key);
        else onActivateFile(item);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        state.selectAll(order);
      } else if (event.key === "Escape") {
        state.clear();
      } else if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        // ⌘/Ctrl+K from the list focuses the search too (the screen also listens app-wide).
        event.preventDefault();
        onSearchShortcut();
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onSearchShortcut();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const target = event.key === "Home" ? 0 : items.length - 1;
        setFocused(target);
        focusIndex(target);
      } else if (event.key.startsWith("Arrow")) {
        const target = nextIndex(index, event.key);
        if (target === null) return;
        event.preventDefault();
        setFocused(target);
        focusIndex(target);
        if (event.shiftKey) {
          const next = items[target];
          if (next) state.range(next.key, order);
        }
      }
    },
    [focusIndex, items, nextIndex, onActivateFile, onOpenFolder, onSearchShortcut, onShortcut, order, selection],
  );

  const pointerDown = useCallback(
    (event: PointerEvent, item: Item) => {
      if (event.pointerType !== "touch") return;
      const timer = setTimeout(() => {
        selection.getState().set(item.key);
        if (press.current) press.current.fired = true;
      }, LONG_PRESS_MS);
      press.current = { timer, fired: false };
    },
    [selection],
  );
  const pointerEnd = useCallback(() => {
    const current = press.current;
    if (!current) return;
    if (!current.fired) {
      clearTimeout(current.timer);
      press.current = null;
      return;
    }
    // The click that follows a long press is swallowed; if none follows (a scroll took over), the flag must not outlive the gesture.
    setTimeout(() => {
      if (press.current === current) press.current = null;
    }, 100);
  }, []);

  const contextMenu = useCallback(
    (event: MouseEvent, item: Item) => {
      // Android fires contextmenu on a long press; that gesture selects instead.
      if (layout === "compact") {
        event.preventDefault();
        return;
      }
      if (!onContextItem(item)) {
        event.stopPropagation();
        return;
      }
      if (!selection.getState().keys.has(item.key)) selection.getState().set(item.key);
    },
    [layout, onContextItem, selection],
  );

  const itemProps = useCallback(
    (item: Item, index: number) => ({
      tabIndex: index === clampedFocus ? 0 : -1,
      "data-index": index,
      onClick: (event: MouseEvent) => { click(event, item); },
      // Double-click opens, like Enter: a folder navigates, a file previews. A touch tap already opens on a phone.
      onDoubleClick: () => {
        if (layout === "compact") return;
        if (item.kind === "folder") onOpenFolder(item);
        else onActivateFile(item);
      },
      onKeyDown: (event: KeyboardEvent) => { keyDown(event, item, index); },
      onFocus: () => { setFocused(index); },
      onPointerDown: (event: PointerEvent) => { pointerDown(event, item); },
      onPointerUp: pointerEnd,
      onPointerLeave: pointerEnd,
      onPointerCancel: pointerEnd,
      onContextMenu: (event: MouseEvent) => { contextMenu(event, item); },
    }),
    [clampedFocus, click, contextMenu, keyDown, layout, onActivateFile, onOpenFolder, pointerDown, pointerEnd],
  );

  return { itemProps };
}
