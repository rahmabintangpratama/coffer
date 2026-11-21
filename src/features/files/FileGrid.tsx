import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Check } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionMenu } from "@/components/ActionMenu";
import { useLayout } from "@/components/layout";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { actionsFor } from "./actions";
import { FileIcon } from "./FileIcon";
import { Name, stopRowEvents } from "./FileRow";
import type { ItemViewProps } from "./FileList";
import type { Item } from "./model";
import { useSelection } from "./selection";
import { useItemInteractions } from "./useItemInteractions";

// Design: 2 columns at 375; auto-fill with a 176 px minimum at 768 and 200 px at 1440 (AC-20.3).
const MIN_TILE = { rail: 176, sidebar: 200 } as const;
const GAP = 12;
const HEADING = 32;
const FOLDER_ROW = 48 + GAP;
const FILE_ROW = 168 + GAP;

type GridRow = { kind: "heading" } | { kind: "folders" | "files"; items: Item[]; start: number };

function buildRows(items: Item[], columns: number): GridRow[] {
  const firstFile = items.findIndex((item) => item.kind === "file");
  const folders = firstFile < 0 ? items.length : firstFile;
  const rows: GridRow[] = [];
  if (folders > 0) rows.push({ kind: "heading" });
  for (let start = 0; start < folders; start += columns) rows.push({ kind: "folders", items: items.slice(start, Math.min(start + columns, folders)), start });
  for (let start = folders; start < items.length; start += columns) rows.push({ kind: "files", items: items.slice(start, start + columns), start });
  return rows;
}

/** The grid view (AC-20.3): folder chips under a "Folders" heading, then file cards; virtualized by row. */
export function FileGrid(props: ItemViewProps) {
  const { items, folderLabel, handlers } = props;
  const layout = useLayout();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [margin, setMargin] = useState(0);
  const keys = useSelection((state) => state.keys);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setWidth(box.width);
      setMargin(box.top + window.scrollY);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);

  const columns = layout === "compact" ? 2 : Math.max(1, Math.floor((width + GAP) / (MIN_TILE[layout] + GAP)));
  const rows = useMemo(() => buildRows(items, columns), [items, columns]);
  const folderTotal = useMemo(() => {
    const first = items.findIndex((item) => item.kind === "file");
    return first < 0 ? items.length : first;
  }, [items]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      const row = rows[index];
      return row?.kind === "heading" ? HEADING : row?.kind === "folders" ? FOLDER_ROW : FILE_ROW;
    },
    overscan: 4,
    scrollMargin: margin,
    initialRect: { width: 0, height: typeof window === "undefined" ? 800 : window.innerHeight },
  });

  const focusIndex = useCallback(
    (index: number) => {
      const rowIndex = rows.findIndex((row) => row.kind !== "heading" && index >= row.start && index < row.start + row.items.length);
      if (rowIndex >= 0) virtualizer.scrollToIndex(rowIndex);
      requestAnimationFrame(() => {
        container.current?.querySelector<HTMLElement>(`[data-index="${index.toString()}"]`)?.focus();
      });
    },
    [rows, virtualizer],
  );

  const requested = props.focusRequest;
  useEffect(() => {
    if (requested) focusIndex(requested.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per request, not when focusIndex changes
  }, [requested?.nonce]);
  const nextIndex = useCallback(
    (current: number, key: string) => {
      if (key === "ArrowRight") return Math.min(items.length - 1, current + 1);
      if (key === "ArrowLeft") return Math.max(0, current - 1);
      const inFolders = current < folderTotal;
      const start = inFolders ? 0 : folderTotal;
      const end = inFolders ? folderTotal : items.length;
      const column = (current - start) % columns;
      if (key === "ArrowDown") {
        const below = current + columns;
        if (below < end) return below;
        if (inFolders && items.length > folderTotal) return Math.min(items.length - 1, folderTotal + column);
        return null;
      }
      if (key === "ArrowUp") {
        const above = current - columns;
        if (above >= start) return above;
        if (!inFolders && folderTotal > 0) {
          const lastRowStart = folderTotal - 1 - ((folderTotal - 1) % columns);
          return Math.min(folderTotal - 1, lastRowStart + column);
        }
        return null;
      }
      return null;
    },
    [columns, folderTotal, items.length],
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
  });

  return (
    <div
      ref={container}
      role="grid"
      aria-label={t("files.list.label", { folder: folderLabel })}
      aria-multiselectable="true"
      data-component="FileGrid"
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtual) => {
        const row = rows[virtual.index];
        if (!row) return null;
        const transform = `translateY(${(virtual.start - margin).toString()}px)`;
        if (row.kind === "heading") {
          return (
            <div key="heading" role="row" className="absolute top-0 left-0 w-full" style={{ transform, height: HEADING }}>
              <h2 role="columnheader" className="text-sm font-semibold text-fg-muted">{t("files.section.folders")}</h2>
            </div>
          );
        }
        return (
          <div
            key={row.start}
            role="row"
            className="absolute top-0 left-0 grid w-full gap-3"
            style={{ transform, height: (row.kind === "folders" ? FOLDER_ROW : FILE_ROW) - GAP, gridTemplateColumns: `repeat(${columns.toString()}, minmax(0, 1fr))` }}
          >
            {row.items.map((item, offset) => (
              <Tile key={item.key} item={item} selected={keys.has(item.key)} index={row.start + offset} itemProps={itemProps} handlers={handlers} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Tile({ item, selected, index, itemProps, handlers }: { item: Item; selected: boolean; index: number; itemProps: ReturnType<typeof useItemInteractions>["itemProps"]; handlers: ItemViewProps["handlers"] }) {
  const menu = actionsFor(item, handlers);
  const folder = item.kind === "folder";
  return (
    <div
      {...itemProps(item, index)}
      role="gridcell"
      aria-selected={selected}
      data-component={folder ? "FolderTile" : "FileTile"}
      className={cn(
        "relative flex min-w-0 cursor-default flex-col overflow-hidden rounded-md border select-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        selected ? "border-accent bg-selected" : "border-line bg-surface hover:bg-hover",
        folder && "flex-row items-center gap-3 px-3",
      )}
    >
      {item.kind === "folder" ? (
        <>
          <FileIcon kind="folder" />
          <Name name={item.name} className="flex-1" />
        </>
      ) : (
        <>
          <div className="flex flex-1 items-center justify-center bg-subtle">
            <FileIcon kind={item.fileKind} className="size-10" />
          </div>
          <div className="px-3 py-2">
            <Name name={item.name} />
          </div>
        </>
      )}
      {selected && (
        <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-accent text-on-accent">
          <Check aria-hidden="true" className="size-4" />
        </span>
      )}
      {menu.length > 0 && (
        <div {...stopRowEvents} className="absolute top-1 right-1 rounded-full bg-surface">
          <ActionMenu groups={menu} triggerLabel={t("row.more", { name: item.name })} title={item.name} closeLabel={t("act.close")} component="ContextMenu" />
        </div>
      )}
    </div>
  );
}
