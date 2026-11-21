import { Check } from "lucide-react";
import type { HTMLAttributes } from "react";
import { ActionMenu, type MenuGroup } from "@/components/ActionMenu";
import type { LayoutMode } from "@/components/layout";
import { formatBytes, formatModified } from "@/lib/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FileIcon } from "./FileIcon";
import type { Item } from "./model";

/** The ⋮ cell is its own control: its clicks, presses and keys must not select the row or open the item behind it. */
export const stopRowEvents = {
  onClick: (event: { stopPropagation: () => void }) => { event.stopPropagation(); },
  onDoubleClick: (event: { stopPropagation: () => void }) => { event.stopPropagation(); },
  onPointerDown: (event: { stopPropagation: () => void }) => { event.stopPropagation(); },
  onKeyDown: (event: { stopPropagation: () => void }) => { event.stopPropagation(); },
};

export interface FileRowProps {
  item: Item;
  index: number;
  selected: boolean;
  layout: LayoutMode;
  menu: MenuGroup[];
  /** Position and height from the virtualizer. */
  top: number;
  height: number;
  rowProps: HTMLAttributes<HTMLDivElement> & { "data-index": number };
}

/**
 * One row (FR-20): icon, name over "date · size" at 375 px; Name, Last modified,
 * File size and ⋮ from 768 px. The name is a text node, truncated in the middle of
 * the extension by two spans so the extension always shows (AC-20.6).
 */
export function FileRow({ item, index, selected, layout, menu, top, height, rowProps }: FileRowProps) {
  const compact = layout === "compact";
  const modified = item.kind === "file" ? formatModified(item.lastModified) : "";
  const size = item.kind === "file" ? formatBytes(item.size) : "";
  const meta = item.kind === "file" ? t("files.row.meta", { date: modified, size }) : t("type.folder");

  return (
    <div
      {...rowProps}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-component="FileRow"
      data-kind={item.kind}
      style={{ transform: `translateY(${top.toString()}px)`, height }}
      className={cn(
        "group absolute top-0 left-0 grid w-full cursor-default items-center gap-3 border-b border-line px-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        compact ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[auto_minmax(0,1fr)_9rem_7rem_auto]",
        selected ? "bg-selected hover:bg-selected-hover" : "hover:bg-hover",
      )}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <div role="gridcell" className="flex size-6 items-center justify-center">
        {selected ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-on-accent">
            <Check aria-hidden="true" className="size-4" />
          </span>
        ) : (
          <FileIcon kind={item.kind === "folder" ? "folder" : item.fileKind} />
        )}
      </div>
      <div role="gridcell" className="min-w-0">
        <Name name={item.name} />
        {compact && <p className="truncate text-sm text-fg-muted">{meta}</p>}
      </div>
      {!compact && (
        <>
          <div role="gridcell" className="truncate text-sm text-fg-muted">{modified}</div>
          <div role="gridcell" className="truncate text-sm text-fg-muted">{size}</div>
        </>
      )}
      <div role="gridcell" {...stopRowEvents} className="flex size-(--cf-size-touch-min) items-center justify-center @md:size-auto">
        {menu.length > 0 && (
          <ActionMenu
            groups={menu}
            triggerLabel={t("row.more", { name: item.name })}
            title={item.name}
            closeLabel={t("act.close")}
            component="ContextMenu"
          />
        )}
      </div>
    </div>
  );
}

/**
 * A name that is cut in the middle: the stem shrinks with an ellipsis and the
 * last characters (the extension) never do. Bidi isolation keeps RTL and mixed
 * names in order.
 */
export function Name({ name, className }: { name: string; className?: string }) {
  const dot = name.lastIndexOf(".");
  const split = dot > 0 && name.length - dot <= 8 ? dot : Math.max(0, name.length - 6);
  const stem = name.slice(0, split);
  const tail = name.slice(split);
  return (
    <p className={cn("flex min-w-0 text-base", className)} title={name}>
      <bdi className="min-w-0 truncate">{stem}</bdi>
      <bdi className="shrink-0 whitespace-pre">{tail}</bdi>
    </p>
  );
}
