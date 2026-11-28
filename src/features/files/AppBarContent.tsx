import type { ReactNode } from "react";
import { FilterChips, type ChipSpec } from "@/components/FilterChips";
import { useLayout } from "@/components/layout";
import { SearchPill } from "@/components/SearchPill";
import { SelectionBar } from "@/components/SelectionBar";
import { t, type CopyKey } from "@/lib/i18n";
import { useFilesChrome } from "./chrome";
import { type ModifiedFilter, modifiedFilters, type TypeFilter, typeFilters } from "./model";
import { useSelection } from "./selection";

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

/**
 * The app bar on the Files route (FR-22, FR-23, FR-30). Below 768 px the search
 * pill is the app bar: menu button and pill on one row. From 768 px the brand
 * comes first. Filter chips sit under it. While items are selected the selection
 * bar takes the whole bar; the chips row keeps its height so the list does not move.
 */
export default function FilesAppBar({ menuButton, brand, trailing }: { menuButton: ReactNode; brand: ReactNode; trailing?: ReactNode }) {
  const layout = useLayout();
  const { searchPlaceholder, filters, setFilters, selectedCount, selectionActions } = useFilesChrome();
  const clear = useSelection((state) => state.clear);
  const selecting = selectedCount > 0;

  const chips: ChipSpec[] = [
    {
      id: "type",
      name: t("filter.type"),
      valueLabel: filters.type === null ? null : t(typeLabel[filters.type]),
      options: [
        { id: "any", label: t("filter.any"), checked: filters.type === null, onSelect: () => { setFilters({ ...filters, type: null }); } },
        ...typeFilters.map((type) => ({ id: type, label: t(typeLabel[type]), checked: filters.type === type, onSelect: () => { setFilters({ ...filters, type }); } })),
      ],
    },
    {
      id: "modified",
      name: t("filter.modified"),
      valueLabel: filters.modified === null ? null : t(modifiedLabel[filters.modified]),
      options: [
        { id: "any", label: t("filter.any"), checked: filters.modified === null, onSelect: () => { setFilters({ ...filters, modified: null }); } },
        ...modifiedFilters.map((modified) => ({ id: modified, label: t(modifiedLabel[modified]), checked: filters.modified === modified, onSelect: () => { setFilters({ ...filters, modified }); } })),
      ],
    },
  ];

  return (
    <div data-component="FilesAppBar" className="flex flex-col">
      <div className="flex h-(--cf-size-appbar-height) items-center gap-2 px-3 @md:px-6">
        {selecting ? (
          <SelectionBar
            count={selectedCount}
            countLabel={t("sel.count", { n: selectedCount })}
            toolbarLabel={t("sel.toolbar")}
            clearLabel={t("sel.clear")}
            onClear={clear}
            actions={selectionActions}
          />
        ) : (
          <>
            {menuButton}
            {layout !== "compact" && brand}
            <SearchPill value={filters.query} onChange={(query) => { setFilters({ ...filters, query }); }} placeholder={searchPlaceholder} clearLabel={t("search.clear")} />
            {trailing}
          </>
        )}
      </div>
      <FilterChips
        label={t("filter.label")}
        closeLabel={t("act.close")}
        chips={chips}
        className={selecting ? "invisible px-3 @md:px-6" : "px-3 @md:px-6"}
      />
    </div>
  );
}
