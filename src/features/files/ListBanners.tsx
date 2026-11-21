import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import type { Sort } from "./model";
import type { ListMode } from "./useListing";

export interface ListBannersProps {
  mode: ListMode;
  count: number;
  sort: Sort;
  pageError: boolean;
  /** Search or a filter is active, so the scope note applies (AC-23.5). */
  filtering: boolean;
  onLoadAll: () => void;
  onCancel: () => void;
  onRetryPage: () => void;
}

/**
 * Tells the person when the list is not the whole folder (FR-21): partial with
 * Load all, loading all with Cancel, capped, or a failed later page that keeps
 * what was loaded and offers a retry.
 */
export function ListBanners({ mode, count, sort, pageError, filtering, onLoadAll, onCancel, onRetryPage }: ListBannersProps) {
  if (pageError) {
    return (
      <Banner tone="warning" title={t("files.pageError.title", { count: count.toLocaleString() })} actions={<Button size="sm" onClick={onRetryPage}>{t("act.retry")}</Button>}>
        {t("files.pageError.body")}
      </Banner>
    );
  }
  if (mode === "loadingAll") {
    return (
      <Banner tone="info" actions={<Button size="sm" onClick={onCancel}>{t("act.cancel")}</Button>}>
        {t("files.loadAll.progress", { count: count.toLocaleString() })}
      </Banner>
    );
  }
  if (mode === "capped") {
    return (
      <Banner tone="warning" title={t("files.capped.title", { count: count.toLocaleString() })}>
        {t("files.capped.body", { count: count.toLocaleString() })}
      </Banner>
    );
  }
  if (mode === "partial") {
    // Sorting by size or date only orders what is loaded (AC-21.4).
    const sortNote = sort.by === "name" ? "" : ` ${t("files.partial.sortNote")}`;
    return (
      <Banner tone="info" title={t("files.partial.title", { count: count.toLocaleString() })} actions={<Button size="sm" onClick={onLoadAll}>{t("act.loadAll")}</Button>}>
        {`${t("files.partial.body")}${sortNote}${filtering ? ` ${t("search.scope.partial", { count: count.toLocaleString() })}` : ""}`}
      </Banner>
    );
  }
  return null;
}
