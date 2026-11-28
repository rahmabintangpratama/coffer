import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderInput, FolderPlus, Share2, Star, StarOff, Trash2 } from "lucide-react";
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
import { ReadOnlyNotice, writeGate } from "@/features/readonly";
import { useRecordOpen, useStarActions, useStarredKeys } from "@/features/library";
import { useShareAction } from "@/features/share";
import { candidatesFromDrop, useTransfers, useUpload } from "@/features/transfers";
import { actionsFor, type ActionHandlers } from "./actions";
import { Breadcrumb } from "./Breadcrumb";
import { DetailsPanel } from "./DetailsPanel";
import { EmptyActions } from "./EmptyActions";
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
import { ShortcutSheet } from "./ShortcutSheet";
import type { ItemShortcut } from "./shortcuts";

// The viewer is its own chunk, loaded the first time a file is opened.
const Preview = lazy(() => import("@/features/preview").then((module) => ({ default: module.Preview })));
// "Search all of {bucket}" is its own chunk too, loaded when asked for (AC-23.6).
const BucketSearch = lazy(() => import("./BucketSearch"));
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
  /** "Use another key" on the read-only banner: the app starts Add connection. */
  onUseAnotherKey: () => void;
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

function Folder({ connection, relative, root, settings, onSettings, notify, onUseAnotherKey }: FilesScreenProps & { relative: string; root: string }) {
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
  const searchPlaceholder = relative === "" ? t("search.placeholderRoot", { bucket }) : t("search.placeholderFolder", { folder: folderLabel });
  useEffect(() => {
    activate(searchPlaceholder);
    return deactivate;
  }, [activate, deactivate, searchPlaceholder]);
  // The bucket-wide search runs for the pill's text; it closes when the text is cleared.
  const [everywhereAsked, setEverywhere] = useState(false);
  const searching = filters.query.trim() !== "";
  // Clearing the pill closes it; typing again starts from this folder's results.
  if (!searching && everywhereAsked) setEverywhere(false);
  const everywhere = everywhereAsked && searching;
  const searchAll = searching && !everywhere ? (
    <Button variant="link" onClick={() => { setEverywhere(true); }}>{t("search.all", { bucket })}</Button>
  ) : null;
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
    // A rename, move or trash may have carried or removed a star (AC-80.2).
    void queryClient.invalidateQueries({ queryKey: ["starred", connection.id] });
  }, [queryClient, connection.id, bucket, root, relative]);
  const runHooks = useMemo(() => ({ notify, onChanged: reload }), [notify, reload]);
  const { rename, copy: makeCopy, move, dialogs: operationDialogs } = useOperationDialogs({ connection, folderPrefix: root + relative, folderName: folderLabel, root, hooks: runHooks });
  const { trash, dialog: trashDialog } = useTrashAction({ connection, root, hooks: runHooks, confirm: settings.confirmTrash });
  const { share, dialog: shareDialog } = useShareAction({ connection, notify });
  const readOnly = !writable;
  const starredKeys = useStarredKeys(connection);
  const { star: addStars, unstar: removeStars } = useStarActions(connection, notify);
  const recordOpen = useRecordOpen(connection);
  // AC-81.1: every file shown in the viewer, also by Previous and Next, goes to Recent.
  const previewed = previewIndex >= 0 ? previewFiles[previewIndex] : undefined;
  useEffect(() => {
    if (previewed) recordOpen(previewed);
  }, [previewed, recordOpen]);
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
      open: (item) => {
        if (item.kind === "folder") navigate(pathFromPrefix(item.key.slice(root.length)));
        else openPreview(item.key);
      },
      preview: (item) => { if (item.kind === "file") openPreview(item.key); },
      details: (item) => { if (item.kind === "file") setDetailsKey(item.key); },
      copyKey: (item) => {
        void navigator.clipboard.writeText(item.key).then(() => { notify(t("toast.copied")); });
      },
      share: (item) => { if (item.kind === "file") share({ key: item.key, name: item.name }); },
      rename: (item) => { rename({ key: item.key, name: item.name, kind: item.kind }); },
      makeCopy: (item) => { if (item.kind === "file") makeCopy({ key: item.key, name: item.name, kind: "file" }); },
      // A menu opened on a selected item moves the whole selection, like Download.
      move: (items) => {
        const state = useSelection.getState();
        const first = items[0];
        const chosen = first && items.length === 1 && state.keys.has(first.key) && state.keys.size > 1 ? visible.filter((item) => state.keys.has(item.key)) : items;
        move(chosen.map((item) => ({ key: item.key, name: item.name, kind: item.kind })));
      },
      isStarred: (item) => starredKeys.has(item.key),
      star: (items, add) => {
        const state = useSelection.getState();
        const first = items[0];
        const chosen = first && items.length === 1 && state.keys.has(first.key) && state.keys.size > 1 ? visible.filter((item) => state.keys.has(item.key)) : items;
        (add ? addStars : removeStars)(chosen.map((item) => ({ key: item.key, kind: item.kind })));
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
    [connection, visible, notify, rename, makeCopy, move, trash, share, inTrash, starredKeys, addStars, removeStars, navigate, root.length],
  );

  // The selection bar is drawn by the app bar; it is told what is selected and which actions apply (AC-30.3).
  useEffect(() => {
    const onlyFiles = selected.every((item) => item.kind === "file");
    setSelection(selected.length, [
      { id: "download", label: t("act.download"), icon: <Download aria-hidden="true" className="size-5" />, disabled: !onlyFiles, onSelect: () => { handlers.download(selected); } },
      { id: "share", label: t("act.share"), icon: <Share2 aria-hidden="true" className="size-5" />, disabled: selected.length !== 1 || !onlyFiles, onSelect: () => { { const only = selected[0]; if (only) handlers.share(only); }; } },
      // Stars are local, so they stay on a read-only key; Remove when every selected item is starred, else Add.
      selected.length > 0 && selected.every((item) => starredKeys.has(item.key))
        ? { id: "unstar", label: t("act.unstar"), icon: <StarOff aria-hidden="true" className="size-5" />, onSelect: () => { handlers.star(selected, false); } }
        : { id: "star", label: t("act.star"), icon: <Star aria-hidden="true" className="size-5" />, onSelect: () => { handlers.star(selected, true); } },
      // A read-only key drops Move and Move to trash from the bar: it has no room for a reason line, and the menus say why (AC-111.3).
      ...(readOnly
        ? []
        : [
            { id: "move", label: t("act.move"), icon: <FolderInput aria-hidden="true" className="size-5" />, onSelect: () => { handlers.move(selected); } },
            ...(handlers.trash ? [{ id: "trash", label: t("act.trash"), icon: <Trash2 aria-hidden="true" className="size-5" />, onSelect: () => { handlers.trash?.(selected); } }] : []),
          ]),
    ]);
  }, [selected, handlers, setSelection, readOnly, starredKeys]);

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
      // "Folder created · Open" (M11).
      notify(t("toast.folderCreated", { name }), { label: t("kb.open"), run: () => { navigate(pathFromPrefix(`${relative}${name}/`)); } });
    },
    [connection, bucket, root, relative, reload, notify, navigate],
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
      actions: [{ id: "newFolder", label: t("act.newFolder"), icon: <FolderPlus aria-hidden="true" className="size-5 text-fg-muted" />, ...writeGate(readOnly).action(), onSelect: () => { setNewFolderOpen(true); } }],
    },
  ];

  const filtering = hasFilters(filters);
  const onSort = (by: "name" | "modified" | "size") => {
    onSettings({ sort: { by, dir: settings.sort.by === by && settings.sort.dir === "asc" ? "desc" : "asc" } });
  };

  // FR-26: a shortcut on an item acts on the selection when there is one, else on that item.
  const onShortcut = useCallback(
    (action: ItemShortcut, item: Item) => {
      const targets = selected.length > 0 ? selected : [item];
      const first = targets[0];
      if (!first) return;
      if (readOnly && (action === "rename" || action === "move" || action === "trash")) {
        notify(t("ro.reason"));
        return;
      }
      if (action === "rename") { if (targets.length === 1) handlers.rename(first); }
      else if (action === "move") handlers.move(targets);
      else if (action === "trash") handlers.trash?.(targets);
      else if (action === "star") handlers.star(targets, !targets.every((target) => starredKeys.has(target.key)));
      else if (first.kind === "file") handlers.details(first);
    },
    [selected, readOnly, notify, handlers, starredKeys],
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // App-wide keys while Files shows: never while typing, and never under an open dialog (it owns Escape there).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing || document.querySelector("dialog[open]") !== null) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (event.key === "Escape" && useSelection.getState().keys.size > 0 && document.querySelector('[role="menu"]') === null) {
        // Escape clears the selection wherever focus is, a toast included (AC-30.4); an open menu closes first.
        useSelection.getState().clear();
      }
    };
    // Capture, so a browser or a widget that handles the key on the way down cannot swallow it first.
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); };
  }, [focusSearch]);

  const viewProps = { readOnly, onShortcut, items: visible, density: settings.density, folderLabel, handlers, onOpenFolder: openFolder, onSearchShortcut: focusSearch, onContextItem, focusRequest };

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
        {/* From 768 px the body says files can be dropped here; a phone has no drag and drop. */}
        <p className="mt-2 text-fg-muted">{layout === "compact" ? t("files.emptyFolder.bodyPhone") : relative === "" ? t("files.emptyBucket.body") : t("files.emptyFolder.body")}</p>
        {writable && <EmptyActions onFiles={(candidates) => void upload(candidates)} onNewFolder={() => { setNewFolderOpen(true); }} />}
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div role="status" data-component="EmptyState" className="py-12 text-center">
        <h2 className="text-lg font-semibold">{t("search.none.title", { q: filters.query })}</h2>
        <p className="mt-2 text-fg-muted">{relative === "" ? t("search.none.bodyRoot", { bucket }) : t("search.none.bodyFolder", { folder: folderLabel })}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {searchAll && <Button variant="primary" onClick={() => { setEverywhere(true); }}>{t("search.all", { bucket })}</Button>}
          <Button onClick={() => { setFilters(noFilters); }}>{t("search.clearFilters")}</Button>
        </div>
      </div>
    );
  } else {
    const view = settings.view === "grid" ? <FileGrid {...viewProps} connection={connection} /> : <FileList {...viewProps} sort={settings.sort} onSort={onSort} />;
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
        {readOnly && <ReadOnlyNotice onUseAnotherKey={onUseAnotherKey} />}
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
        {everywhere ? (
          <Suspense fallback={<Skeleton className="h-12" />}>
            <BucketSearch connection={connection} root={root} query={filters.query} showHidden={settings.showHiddenFiles} onBack={() => { setEverywhere(false); }} />
          </Suspense>
        ) : (
          <>
            {visible.length > 0 && searchAll && <div className="flex justify-end">{searchAll}</div>}
            {body}
          </>
        )}
      </div>
      <ShortcutSheet open={shortcutsOpen} onClose={() => { setShortcutsOpen(false); }} />
      {conflictDialog}
      {operationDialogs}
      {trashDialog}
      {shareDialog}
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
            renderDetails={(file, close) => (
              <DetailsPanel inViewer layout={layout} connection={connection} file={file} folder={relative === "" ? "/" : relative} onClose={close} onCopyKey={() => { handlers.copyKey(file); }} />
            )}
            onCopyKey={handlers.copyKey}
            onShare={(file) => { handlers.share(file); }}
            isStarred={(file) => starredKeys.has(file.key)}
            onToggleStar={(file) => { handlers.star([file], !starredKeys.has(file.key)); }}
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
        onClose={() => {
          const closing = detailsFile;
          setDetailsKey(null);
          // From 1024 px the panel is part of the page, not a dialog, so nothing hands focus back; in the sheet the menu that opened it
          // is already gone when the dialog closes, so the browser has nowhere to return to. Either way focus would drop to the page.
          if (closing) {
            const label = t("row.more", { name: closing.name });
            requestAnimationFrame(() => {
              [...document.querySelectorAll<HTMLElement>("button[aria-haspopup='menu']")].find((button) => button.getAttribute("aria-label") === label)?.focus();
            });
          }
        }}
        onCopyKey={() => { if (detailsFile) handlers.copyKey(detailsFile); }}
      />
    </section>
  );
}
