import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { ContextMenuArea } from "@/components/ActionMenu";
import { useLayout } from "@/components/layout";
import { Skeleton } from "@/components/Skeleton";
import { t } from "@/lib/i18n";
import type { AppError } from "@/lib/s3/errors";
import type { ConnectionSummary, FileItem, FolderItem, Settings } from "@/lib/types";
import { actionsFor, type ActionHandlers } from "./actions";
import { Breadcrumb } from "./Breadcrumb";
import { DetailsPanel } from "./DetailsPanel";
import { downloadItems } from "./download";
import { FileGrid } from "./FileGrid";
import { FileList } from "./FileList";
import { ListBanners } from "./ListBanners";
import { filterItems, type Filters, hasFilters, type Item, noFilters, pathFromPrefix, prefixFromPath, sortItems, withoutHidden } from "./model";
import { SelectionBar } from "./SelectionBar";
import { FilterChips, SearchPill, ViewControls } from "./Toolbar";
import { useListing } from "./useListing";
import { usePullToRefresh } from "./usePullToRefresh";
import { useSelection } from "./selection";

/** The raw hash path. wouter decodes the location it hands out, which would turn `%2541` into `%41` and then `A`, so the path is read here. */
function rawHashPath(): string {
  return `/${window.location.hash.replace(/^#\/?/, "")}`;
}

/** Files: the folder named by the hash path, under the connection root. The folder is the key, so state resets on navigation. */
export interface FilesScreenProps {
  connection: ConnectionSummary;
  /** Settings and toasts live in the app shell; the feature gets what it needs as props. */
  settings: Pick<Settings, "view" | "sort" | "density" | "showHiddenFiles">;
  onSettings: (patch: Partial<Settings>) => void;
  notify: (message: string) => void;
}

export function FilesScreen(props: FilesScreenProps) {
  useLocation(); // subscribe to hash changes
  const root = props.connection.prefix ?? "";
  const relative = prefixFromPath(rawHashPath());
  return <Folder key={`${props.connection.id}|${relative}`} {...props} relative={relative} root={root} />;
}

function errorBody(error: AppError): string {
  if (error.code === "accessDenied") return t("files.error.denied");
  if (error.code === "network" || error.code === "cors") return t("files.error.body", { seconds: 30 });
  return t("files.error.generic");
}

function Folder({ connection, relative, root, settings, onSettings, notify }: FilesScreenProps & { relative: string; root: string }) {
  const layout = useLayout();
  const bucket = connection.bucket ?? "";
  const folderLabel = relative === "" ? bucket : (relative.slice(0, -1).split("/").at(-1) ?? bucket);
  const listing = useListing(connection, root + relative);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [contextItem, setContextItem] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const selection = useSelection();
  const [, navigate] = useLocation();

  // A new folder starts with nothing selected (AC-30.4).
  useEffect(() => {
    selection.clear();
    return () => { useSelection.getState().clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on mount and unmount only
  }, []);

  const visible = useMemo(() => {
    const base = withoutHidden(listing.items, settings.showHiddenFiles);
    return sortItems(filterItems(base, filters), settings.sort);
  }, [listing.items, settings.showHiddenFiles, settings.sort, filters]);

  const selected = useMemo(() => visible.filter((item) => selection.keys.has(item.key)), [visible, selection.keys]);
  const detailsFile = useMemo<FileItem | null>(() => {
    const found = listing.items.find((item) => item.key === detailsKey);
    return found?.kind === "file" ? found : null;
  }, [listing.items, detailsKey]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await listing.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [listing]);
  usePullToRefresh(() => void refresh(), layout === "compact");

  const handlers: ActionHandlers = useMemo(
    () => ({
      // A menu opened on a selected item acts on the whole selection (AC-37.3).
      download: (items) => {
        const state = useSelection.getState();
        const first = items[0];
        const chosen = first && items.length === 1 && state.keys.has(first.key) && state.keys.size > 1 ? visible.filter((item) => state.keys.has(item.key)) : items;
        void downloadItems(connection, chosen, notify);
      },
      details: (item) => { if (item.kind === "file") setDetailsKey(item.key); },
      copyKey: (item) => {
        void navigator.clipboard.writeText(item.key).then(() => { notify(t("toast.copied")); });
      },
    }),
    [connection, visible, notify],
  );

  const openFolder = useCallback(
    (folder: FolderItem) => { navigate(pathFromPrefix(folder.key.slice(root.length))); },
    [navigate, root.length],
  );
  const focusSearch = useCallback(() => { search.current?.focus(); }, []);
  const onContextItem = useCallback(
    (item: Item) => {
      if (actionsFor(item, handlers).length === 0) return false;
      setContextItem(item);
      return true;
    },
    [handlers],
  );

  const filtering = hasFilters(filters);
  const onSort = (by: "name" | "modified" | "size") => {
    onSettings({ sort: { by, dir: settings.sort.by === by && settings.sort.dir === "asc" ? "desc" : "asc" } });
  };

  const viewProps = { items: visible, density: settings.density, folderLabel, handlers, onOpenFolder: openFolder, onSearchShortcut: focusSearch, onContextItem };

  let body;
  if (listing.isPending) {
    body = (
      <div role="status" aria-label={t("files.loading")} className="flex flex-col gap-2" data-component="FileListLoading">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-12" />)}
      </div>
    );
  } else if (listing.error) {
    body = (
      <Banner tone="danger" title={t("files.error.title")} actions={<Button size="sm" onClick={listing.retry}>{t("act.retry")}</Button>}>
        {errorBody(listing.error)}
      </Banner>
    );
  } else if (listing.items.length === 0 && listing.mode === "complete") {
    body = (
      <div role="status" data-component="EmptyState" className="py-12 text-center">
        <h2 className="text-lg font-semibold">{relative === "" ? t("files.emptyBucket.title", { bucket }) : t("files.emptyFolder.title")}</h2>
        <p className="mt-2 text-fg-muted">{relative === "" ? t("files.emptyBucket.body") : t("files.emptyFolder.body")}</p>
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div role="status" data-component="EmptyState" className="py-12 text-center">
        <h2 className="text-lg font-semibold">{t("search.none.title", { q: filters.query })}</h2>
        <p className="mt-2 text-fg-muted">{t("search.none.bodyFolder", { folder: folderLabel })}</p>
        <Button className="mt-4" onClick={() => { setFilters(noFilters); }}>{t("search.clearFilters")}</Button>
      </div>
    );
  } else {
    const view = settings.view === "grid" ? <FileGrid {...viewProps} /> : <FileList {...viewProps} sort={settings.sort} onSort={onSort} />;
    body = (
      <ContextMenuArea component="ContextMenu" groups={contextItem ? actionsFor(contextItem, handlers) : []}>
        {view}
      </ContextMenuArea>
    );
  }

  return (
    <section data-component="FilesScreen" className="flex gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h1 className="sr-only">{t("nav.files")}</h1>
        <SearchPill value={filters.query} onChange={(query) => { setFilters({ ...filters, query }); }} placeholder={t("search.placeholderFolder", { folder: folderLabel })} inputRef={search} />
        <FilterChips filters={filters} onChange={setFilters} />
        {/* The selection bar takes the place of the path and view controls, so selecting never moves the list under the pointer. */}
        <div className="flex min-h-(--cf-size-touch-min) flex-wrap items-center justify-between gap-2">
          {selected.length > 0 ? (
            <SelectionBar selected={selected} onDownload={handlers.download} />
          ) : (
            <>
              <Breadcrumb rootLabel={bucket} prefix={relative} menu={[]} />
              <ViewControls sort={settings.sort} view={settings.view} onSort={(sort) => { onSettings({ sort }); }} onView={(view) => { onSettings({ view }); }} onRefresh={() => void refresh()} refreshing={refreshing} />
            </>
          )}
        </div>
        {!listing.isPending && !listing.error && (
          <ListBanners
            mode={listing.mode}
            count={listing.items.length}
            sort={settings.sort}
            pageError={listing.pageError}
            filtering={filtering}
            onLoadAll={listing.loadAll}
            onCancel={listing.cancelLoadAll}
            onRetryPage={listing.retryPage}
          />
        )}
        {body}
      </div>
      <DetailsPanel
        layout={layout}
        connection={connection}
        file={detailsFile}
        folder={relative === "" ? "/" : relative}
        onClose={() => { setDetailsKey(null); }}
        onCopyKey={() => { if (detailsFile) handlers.copyKey(detailsFile); }}
      />
    </section>
  );
}
