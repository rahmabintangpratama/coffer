import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLayout } from "@/components/layout";
import { t } from "@/lib/i18n";
import type { Density, FolderItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { actionsFor, type ActionHandlers } from "./actions";
import { FileRow } from "./FileRow";
import type { Item, Sort } from "./model";
import { useSelection } from "./selection";
import type { ItemShortcut } from "./shortcuts";
import { useItemInteractions } from "./useItemInteractions";

const OVERSCAN = 8;

export interface ItemViewProps {
  items: Item[];
  density: Density;
  folderLabel: string;
  handlers: ActionHandlers;
  /** A read-only connection: write actions are disabled with the reason (FR-111). */
  readOnly: boolean;
  onOpenFolder: (folder: FolderItem) => void;
  onSearchShortcut: () => void;
  onContextItem: (item: Item) => boolean;
  onShortcut: (action: ItemShortcut, item: Item) => void;
  /** Move focus to this item (the preview closed and the row it came from takes focus back). `nonce` makes the same index fire again. */
  focusRequest?: { index: number; nonce: number } | undefined;
}

const rowHeight = (layout: string, density: Density): number =>
  layout === "compact" ? 56 : density === "compact" ? 36 : 48;

/**
 * The virtualized list (FR-20, NFR-4): only the rows near the viewport exist,
 * however many items were loaded. The page scrolls, so pull-to-refresh and the
 * browser's own scrolling keep working. role=grid with one tab stop and arrow
 * keys (AC-20.5).
 */
export function FileList(props: ItemViewProps & { sort: Sort; onSort: (by: Sort["by"]) => void }) {
  const { items, density, folderLabel, handlers, sort, onSort } = props;
  const layout = useLayout();
  const compact = layout === "compact";
  const height = rowHeight(layout, density);
  const container = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const keys = useSelection((state) => state.keys);

  // The list starts below the toolbar; the window virtualizer needs that offset.
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => { setMargin(element.getBoundingClientRect().top + window.scrollY); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => { observer.disconnect(); };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => height,
    overscan: OVERSCAN,
    scrollMargin: margin,
    initialRect: { width: 0, height: typeof window === "undefined" ? 800 : window.innerHeight },
  });

  const focusIndex = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index);
      requestAnimationFrame(() => {
        container.current?.querySelector<HTMLElement>(`[data-index="${index.toString()}"]`)?.focus();
      });
    },
    [virtualizer],
  );
  const requested = props.focusRequest;
  useEffect(() => {
    if (requested) focusIndex(requested.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per request, not when focusIndex changes
  }, [requested?.nonce]);
  const nextIndex = useCallback(
    (current: number, key: string) => {
      if (key === "ArrowDown") return Math.min(items.length - 1, current + 1);
      if (key === "ArrowUp") return Math.max(0, current - 1);
      return null;
    },
    [items.length],
  );

  const { itemProps } = useItemInteractions({
    items,
    layout,
    onOpenFolder: props.onOpenFolder,
    onActivateFile: handlers.preview,
    focusIndex,
    nextIndex,
    onSearchShortcut: props.onSearchShortcut,
    onContextItem: props.onContextItem,
    onShortcut: props.onShortcut,
  });

  return (
    <div
      ref={container}
      role="grid"
      aria-label={t("files.list.label", { folder: folderLabel })}
      aria-rowcount={items.length + 1}
      aria-multiselectable="true"
      data-component="FileList"
      className="@container"
    >
      {!compact && (
        <div role="row" aria-rowindex={1} className="grid grid-cols-[auto_minmax(0,1fr)_9rem_7rem_auto] items-center gap-3 border-b border-line px-3 py-2 text-sm text-fg-muted">
          <span className="size-6" aria-hidden="true" />
          <SortHeader label={t("col.name")} by="name" sort={sort} onSort={onSort} />
          <SortHeader label={t("col.modified")} by="modified" sort={sort} onSort={onSort} />
          <SortHeader label={t("col.size")} by="size" sort={sort} onSort={onSort} />
          <span className="size-(--cf-size-control-sm)" aria-hidden="true" />
        </div>
      )}
      <div role="rowgroup" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtual) => {
          const item = items[virtual.index];
          if (!item) return null;
          return (
            <FileRow
              key={item.key}
              item={item}
              index={virtual.index}
              selected={keys.has(item.key)}
              layout={layout}
              menu={actionsFor(item, handlers, props.readOnly)}
              top={virtual.start - margin}
              height={height}
              rowProps={itemProps(item, virtual.index)}
            />
          );
        })}
      </div>
    </div>
  );
}

function SortHeader({ label, by, sort, onSort }: { label: string; by: Sort["by"]; sort: Sort; onSort: (by: Sort["by"]) => void }) {
  const active = sort.by === by;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <div role="columnheader" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => { onSort(by); }}
        className={cn(
          "inline-flex min-h-(--cf-size-control-sm) items-center gap-1 rounded-xs",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          active && "font-semibold text-fg",
        )}
      >
        {label}
        {active && <Arrow aria-hidden="true" className="size-4" />}
      </button>
    </div>
  );
}
