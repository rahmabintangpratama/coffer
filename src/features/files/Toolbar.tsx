import { ArrowDown, ArrowUp, LayoutGrid, List, RefreshCw, Search, X } from "lucide-react";
import type { RefObject } from "react";
import { ActionMenu, type MenuAction } from "@/components/ActionMenu";
import { Button } from "@/components/Button";
import { t, type CopyKey } from "@/lib/i18n";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type Filters, type ModifiedFilter, modifiedFilters, type TypeFilter, typeFilters } from "./model";

/** Search by name in the folder (AC-23.1). `/` focuses it and Esc clears then blurs (AC-23.4). */
export function SearchPill({ value, onChange, placeholder, inputRef }: { value: string; onChange: (value: string) => void; placeholder: string; inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <div data-component="SearchPill" className="relative w-full @md:max-w-180">
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-fg-muted" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        aria-label={placeholder}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => { onChange(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (value === "") inputRef.current?.blur();
          else onChange("");
        }}
        className={cn(
          "h-12 w-full rounded-full border border-line bg-surface pr-11 pl-10 text-md text-fg placeholder:text-fg-muted @md:h-11 @md:text-base",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {value !== "" && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={t("search.clear")}
          icon={<X aria-hidden="true" className="size-4" />}
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
          className="absolute top-1/2 right-1 -translate-y-1/2"
        />
      )}
    </div>
  );
}

const typeLabel: Record<TypeFilter, CopyKey> = {
  folder: "filter.typeOption.folder",
  image: "filter.typeOption.image",
  video: "filter.typeOption.video",
  audio: "filter.typeOption.audio",
  pdf: "filter.typeOption.pdf",
  document: "filter.typeOption.document",
  archive: "filter.typeOption.archive",
};
const modifiedLabel: Record<ModifiedFilter, CopyKey> = {
  today: "filter.modifiedOption.today",
  week: "filter.modifiedOption.week",
  month: "filter.modifiedOption.month",
  year: "filter.modifiedOption.year",
};

function Chip({ name, value, options }: { name: string; value: string | null; options: MenuAction[] }) {
  return (
    <ActionMenu
      groups={[{ id: name, actions: options }]}
      triggerLabel={name}
      title={name}
      closeLabel={t("act.close")}
      component="FilterChips"
      trigger={(props) => (
        <button
          type="button"
          aria-pressed={value !== null}
          aria-haspopup="menu"
          {...props}
          className={cn(
            "inline-flex h-(--cf-size-chip-height) shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            value !== null ? "border-accent-line bg-accent-subtle text-fg" : "border-line bg-surface text-fg hover:bg-hover",
          )}
        >
          {value === null ? name : `${name}: ${value}`}
        </button>
      )}
    />
  );
}

/** Type and Modified chips under the search (AC-23.2). Each is a button with aria-pressed once a value is set. */
export function FilterChips({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  const typeOptions: MenuAction[] = [
    { id: "any", label: t("filter.any"), checked: filters.type === null, onSelect: () => { onChange({ ...filters, type: null }); } },
    ...typeFilters.map((type) => ({ id: type, label: t(typeLabel[type]), checked: filters.type === type, onSelect: () => { onChange({ ...filters, type }); } })),
  ];
  const modifiedOptions: MenuAction[] = [
    { id: "any", label: t("filter.any"), checked: filters.modified === null, onSelect: () => { onChange({ ...filters, modified: null }); } },
    ...modifiedFilters.map((modified) => ({ id: modified, label: t(modifiedLabel[modified]), checked: filters.modified === modified, onSelect: () => { onChange({ ...filters, modified }); } })),
  ];
  return (
    <div role="group" aria-label={t("filter.label")} data-component="FilterChips" className="flex gap-2 overflow-x-auto py-1">
      <Chip name={t("filter.type")} value={filters.type === null ? null : t(typeLabel[filters.type])} options={typeOptions} />
      <Chip name={t("filter.modified")} value={filters.modified === null ? null : t(modifiedLabel[filters.modified])} options={modifiedOptions} />
    </div>
  );
}

/** Sort column and direction, and the list and grid layout (AC-20.1, AC-20.3). */
export function ViewControls({ sort, view, onSort, onView, onRefresh, refreshing }: { sort: Settings["sort"]; view: Settings["view"]; onSort: (sort: Settings["sort"]) => void; onView: (view: Settings["view"]) => void; onRefresh: () => void; refreshing: boolean }) {
  const DirIcon = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor="files-sort">{t("sort.label")}</label>
      <select
        id="files-sort"
        value={sort.by}
        onChange={(event) => { onSort({ ...sort, by: event.target.value as Settings["sort"]["by"] }); }}
        className="h-(--cf-size-touch-min) rounded-sm border border-line bg-surface px-2 text-base text-fg @md:h-(--cf-size-control-md)"
      >
        <option value="name">{t("col.name")}</option>
        <option value="modified">{t("col.modified")}</option>
        <option value="size">{t("col.size")}</option>
      </select>
      <Button
        variant="ghost"
        iconOnly
        aria-label={sort.dir === "asc" ? t("files.sort.asc") : t("files.sort.desc")}
        icon={<DirIcon aria-hidden="true" className="size-5" />}
        onClick={() => { onSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" }); }}
      />
      <div role="group" aria-label={t("view.label")} className="flex">
        <Button variant="ghost" iconOnly aria-pressed={view === "list"} aria-label={t("view.list")} icon={<List aria-hidden="true" className="size-5" />} onClick={() => { onView("list"); }} className={cn(view === "list" && "bg-selected")} />
        <Button variant="ghost" iconOnly aria-pressed={view === "grid"} aria-label={t("view.grid")} icon={<LayoutGrid aria-hidden="true" className="size-5" />} onClick={() => { onView("grid"); }} className={cn(view === "grid" && "bg-selected")} />
      </div>
      <Button variant="ghost" iconOnly aria-label={t("files.refresh")} loading={refreshing} icon={<RefreshCw aria-hidden="true" className="size-5" />} onClick={onRefresh} />
    </div>
  );
}
