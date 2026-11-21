import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderInput, FolderPlus, Trash2 } from "lucide-react";
import { type DragEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { SEARCH_PILL_ID } from "@/components/SearchPill";
import { ContextMenuArea, type MenuGroup } from "@/components/ActionMenu";
import { useLayout } from "@/components/layout";
import { Skeleton } from "@/components/Skeleton";
import { t } from "@/lib/i18n";
import type { AppError } from "@/lib/s3/errors";
import type { ConnectionSummary, FileItem, FolderItem, Settings } from "@/lib/types";
import { useOperationDialogs, useTrashAction } from "@/features/operations";
import { candidatesFromDrop, useTransfers, useUpload } from "@/features/transfers";
import { actionsFor, type ActionHandlers } from "./actions";
import { Breadcrumb } from "./Breadcrumb";
import { DetailsPanel } from "./DetailsPanel";
import { downloadItems } from "./download";
import { FileGrid } from "./FileGrid";
import { FileList } from "./FileList";
import { ListBanners } from "./ListBanners";
import { NewFolderDialog } from "./NewFolderDialog";
import { NewMenu } from "./NewMenu";
import { filterItems, hasFilters, type Item, noFilters, pathFromPrefix, prefixFromPath, sortItems, withoutHidden } from "./model";
import { ViewControls } from "./Toolbar";
import { closePreview, openPreview, readHashRoute, stepPreview } from "./previewRoute";
import { useFilesChrome } from "./chrome";

// The viewer is its own chunk, loaded the first time a file is opened.
const Preview = lazy(() => import("@/features/preview").then((module) => ({ default: module.Preview })));
import { useListing } from "./useListing";
import { usePullToRefresh } from "./usePullToRefresh";
import { useSelection } from "./selection";

/** Files: the folder named by the hash path, under the connection root. The folder is the key, so state resets on navigation. */
export interface FilesScreenProps {
  connection: ConnectionSummary;
  /** Settings and toasts live in the app shell; the feature gets what it needs as props. */
  settings: Pick<Settings, "view" | "sort" | "density" | "showHiddenFiles" | "confirmTrash">;
  onSettings: (patch: Partial<Settings>) => void;
  notify: (message: string, action?: { label: string; run: () => void }) => void;
}

export function FilesScreen(props: FilesScreenProps) {
  useLocation(); // subscribe to hash changes
  const root = props.connection.prefix ?? "";
  const relative = prefixFromPath(readHashRoute().path);
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
  const filters = useFilesChrome((state) => state.filters);
  const setFilters = useFilesChrome((state) => state.setFilters);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [contextItem, setContextItem] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ index: number; nonce: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const queryClient = useQueryClient();
  const hasTransfers = useTransfers((state) => state.transfers.length + state.interrupted.length + state.operations.length > 0);
  const writable = connection.access === "readWrite";
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
  // The preview shows the files of this folder in the order of the list (FR-50); its key is in the address.
  const previewKey = readHashRoute().preview;
  const previewFiles = useMemo(() => visible.filter((item): item is FileItem => item.kind === "file"), [visible]);
  const previewIndex = previewKey === null ? -1 : previewFiles.findIndex((file) => file.key === previewKey);
  const closeViewer = useCallback(() => { closePreview(); }, []);
  // Once the viewer has closed, the row of the file it was showing takes focus, even if the list scrolled while moving between files.
  const viewerClosed = useCallback(
    (previewed: number) => {
      const key = previewFiles[previewed]?.key;
      const index = visible.findIndex((item) => item.key === key);
      if (index >= 0) setFocusRequest((current) => ({ index, nonce: (current?.nonce ?? 0) + 1 }));
    },
    [previewFiles, visible],
  );
  const activate = useFilesChrome((state) => state.activate);
  const deactivate = useFilesChrome((state) => state.deactivate);
  const setSelection = useFilesChrome((state) => state.setSelection);
  // The app bar shows this folder's search and chips for as long as the screen is mounted.
  useEffect(() => {
    activate(folderLabel);
    return deactivate;
  }, [activate, deactivate, folderLabel]);
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

  // After uploads or a new folder the folder reloads from page 1.
  const reload = useCallback(() => {
    void queryClient.resetQueries({ queryKey: ["list", connection.id, bucket, root + relative] });
  }, [queryClient, connection.id, bucket, root, relative]);
  const runHooks = useMemo(() => ({ notify, onChanged: reload }), [notify, reload]);
  const { rename, copy: makeCopy, move, dialogs: operationDialogs } = useOperationDialogs({ connection, folderPrefix: root + relative, folderName: folderLabel, root, hooks: runHooks });
  const { trash, dialog: trashDialog } = useTrashAction({ connection, root, hooks: runHooks, confirm: settings.confirmTrash });
  const readOnly = !writable;
  // Nothing in the trash is trashed again (AC-36.5): inside it Files offers no Move to trash.
  const inTrash = (root + relative).startsWith(`${root}.coffer-trash/`);

  const handlers: ActionHandlers = useMemo(
    () => ({
      // A menu opened on a selected item acts on the whole selection (AC-37.3).
      download: (items) => {
        const state = useSelection.getState();
        const first = items[0];
        const chosen = first && items.length === 1 && state.keys.has(first.key) && state.keys.size > 1 ? visible.filter((item) => state.keys.has(item.key)) : items;
        void downloadItems(connection, chosen, notify);
      },
      preview: (item) => { if (item.kind === "file") openPreview(item.key); },
      details: (item) => { if (item.kind === "file") setDetailsKey(item.key); },
      copyKey: (item) => {
        void navigator.clipboard.writeText(item.key).then(() => { notify(t("toast.copied")); });
      },
      rename: (item) => { rename({ key: item.key, name: item.name, kind: item.kind }); },
      makeCopy: (item) => { if (item.kind === "file") makeCopy({ key: item.key, name: item.name, kind: "file" }); },
      // A menu opened on a selected item moves the whole selection, like Download.
      move: (items) => {
        const state = useSelection.getState();
        const first = items[0];
        const chosen = first && items.length === 1 && state.keys.has(first.key) && state.keys.size > 1 ? visible.filter((item) => state.keys.has(item.key)) : items;
        move(chosen.map((item) => ({ key: item.key, name: item.name, kind: item.kind })));
      },
      ...(inTrash
        ? {}
        : {
            // A menu opened on a selected item trashes the whole selection, like Move.
            trash: (items: Item[]) => {
              const state = useSelection.getState();
              const first = items[0];
              const chosen = first && items.length === 1 && state.keys.has(first.key) && state.keys.size > 1 ? visible.filter((item) => state.keys.has(item.key)) : items;
              trash(chosen.map((item) => ({ key: item.key, name: item.name, kind: item.kind })));
            },
          }),
    }),
    [connection, visible, notify, rename, makeCopy, move, trash, inTrash],
  );

  // The selection bar is drawn by the app bar; it is told what is selected and which actions apply (AC-30.3).
  useEffect(() => {
    const onlyFiles = selected.every((item) => item.kind === "file");
    setSelection(selected.length, [
      { id: "download", label: t("act.download"), icon: <Download aria-hidden="true" className="size-5" />, disabled: !onlyFiles, onSelect: () => { handlers.download(selected); } },
      { id: "move", label: t("act.move"), icon: <FolderInput aria-hidden="true" className="size-5" />, disabled: readOnly, onSelect: () => { handlers.move(selected); } },
      ...(handlers.trash ? [{ id: "trash", label: t("act.trash"), icon: <Trash2 aria-hidden="true" className="size-5" />, disabled: readOnly, onSelect: () => { handlers.trash?.(selected); } }] : []),
    ]);
  }, [selected, handlers, setSelection, readOnly]);

  const openFolder = useCallback(
    (folder: FolderItem) => { navigate(pathFromPrefix(folder.key.slice(root.length))); },
    [navigate, root.length],
  );
  // The pill is in the app bar, away from the list that owns the "/" shortcut, so it is found by its id.
  const focusSearch = useCallback(() => { document.getElementById(SEARCH_PILL_ID)?.focus(); }, []);
  const onContextItem = useCallback(
    (item: Item) => {
      if (actionsFor(item, handlers, readOnly).length === 0) return false;
      setContextItem(item);
      return true;
    },
    [handlers, readOnly],
  );

  const { upload, dialog: conflictDialog } = useUpload({ connection, folderPrefix: root + relative, folderName: folderLabel, notify, onUploaded: reload });
  const existingFolderNames = useMemo(() => new Set(listing.items.filter((item) => item.kind === "folder").map((item) => item.name)), [listing.items]);
  const createFolder = useCallback(
    async (name: string) => {
      const { clientFor, putFolder } = await import("@/lib/s3");
      await putFolder(clientFor(connection), { bucket, key: `${root}${relative}${name}/` });
      reload();
    },
    [connection, bucket, root, relative, reload],
  );

  // Dropping files anywhere in the screen uploads them here (AC-40.2). Only file drags react; the overlay hides on leave or drop.
  const isFileDrag = (event: DragEvent) => writable && event.dataTransfer.types.includes("Files");
  const depth = useRef(0);
  const dragHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault();
    },
    onDragLeave: (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      void candidatesFromDrop(event.dataTransfer).then(upload);
    },
  };

  // The current folder's menu (FolderMenu): New folder for now; Rename, Move and the rest are on the folder's own row in its parent.
  const folderMenu: MenuGroup[] = relative === "" ? [] : [
    {
      id: "new",
      actions: [{ id: "newFolder", label: t("act.newFolder"), icon: <FolderPlus aria-hidden="true" className="size-5 text-fg-muted" />, disabled: readOnly, ...(readOnly ? { reason: t("ro.reason") } : {}), onSelect: () => { setNewFolderOpen(true); } }],
    },
  ];

  const filtering = hasFilters(filters);
  const onSort = (by: "name" | "modified" | "size") => {
    onSettings({ sort: { by, dir: settings.sort.by === by && settings.sort.dir === "asc" ? "desc" : "asc" } });
  };

  const viewProps = { readOnly, items: visible, density: settings.density, folderLabel, handlers, onOpenFolder: openFolder, onSearchShortcut: focusSearch, onContextItem, focusRequest };

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
      <ContextMenuArea component="ContextMenu" groups={contextItem ? actionsFor(contextItem, handlers, readOnly) : []}>
        {view}
      </ContextMenuArea>
    );
  }

  return (
    <section data-component="FilesScreen" className="relative flex gap-6" {...dragHandlers}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h1 className="sr-only">{t("nav.files")}</h1>
        <div className="flex min-h-(--cf-size-touch-min) flex-wrap items-center justify-between gap-2">
          <Breadcrumb rootLabel={bucket} prefix={relative} menu={folderMenu} />
          <div className="flex items-center gap-2">
            <ViewControls sort={settings.sort} view={settings.view} onSort={(sort) => { onSettings({ sort }); }} onView={(view) => { onSettings({ view }); }} onRefresh={() => void refresh()} refreshing={refreshing} />
            {writable && <NewMenu onNewFolder={() => { setNewFolderOpen(true); }} onFiles={(candidates) => void upload(candidates)} raised={hasTransfers} />}
          </div>
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
      {conflictDialog}
      {operationDialogs}
      {trashDialog}
      {previewIndex >= 0 && (
        <Suspense fallback={null}>
          <Preview
            connection={connection}
            files={previewFiles}
            index={previewIndex}
            onClose={closeViewer}
            onClosed={viewerClosed}
            onStep={(delta) => {
              const next = previewFiles[previewIndex + delta];
              if (next) stepPreview(next.key);
            }}
            onDownload={(file) => { void downloadItems(connection, [file], notify); }}
            onDetails={(file) => { setDetailsKey(file.key); }}
            onCopyKey={handlers.copyKey}
          />
        </Suspense>
      )}
      <NewFolderDialog open={newFolderOpen} onClose={() => { setNewFolderOpen(false); }} parentPrefix={root + relative} existingNames={existingFolderNames} onCreate={createFolder} />
      {dragging && (
        <div role="status" data-component="DropOverlay" className="pointer-events-none fixed inset-0 z-(--cf-z-overlay) flex items-center justify-center bg-overlay p-6">
          <div className="rounded-lg border-2 border-dashed border-accent bg-elevated p-8 text-center shadow-overlay">
            <p className="text-lg font-semibold">{t("drop.title", { folder: folderLabel })}</p>
            <p className="mt-1 text-fg-muted">{t("drop.sub")}</p>
          </div>
        </div>
      )}
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
