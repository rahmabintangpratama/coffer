import { ArrowDown, ArrowUp, LayoutGrid, List, RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";

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
