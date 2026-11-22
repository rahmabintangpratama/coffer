import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { FileIcon } from "@/features/files/FileIcon";
import { type DeleteFailure } from "@/lib/s3";
import { startDelete, startRestore } from "@/features/operations";
import { useConflictPrompt } from "@/features/transfers";
import { ReadOnlyNotice, writeGate } from "@/features/readonly";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/i18n";
import { fileKindOf } from "@/lib/s3/keys";
import { parseTrashKey } from "@/lib/s3/trash";
import type { ConnectionSummary } from "@/lib/types";
import { DeleteForeverDialog, type DeleteRequest } from "./DeleteForeverDialog";
import { canRestore, toTrashItems, type TrashItem } from "./model";
import { planRestore } from "./restore";

export interface TrashScreenProps {
  connection: ConnectionSummary;
  /** The connection can write: Restore, Delete forever and Empty trash are disabled with the reason otherwise (FR-111). */
  writable: boolean;
  /** "Use another key" on the read-only banner. */
  onUseAnotherKey: () => void;
  notify: (message: string, action?: { label: string; run: () => void }) => void;
}

const ROW = 64;
const READ_ONLY_REASON_ID = "trash-read-only-reason";
const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function TrashRow({ item, selected, onToggle, index, count, offset }: { item: TrashItem; selected: boolean; onToggle: () => void; index: number; count: number; offset: number }) {
  return (
    <li
      data-component="TrashRow"
      aria-posinset={index + 1}
      aria-setsize={count}
      // The row is the list item itself, placed by the virtualizer, so the list has only list items in it.
      style={{ transform: `translateY(${offset.toString()}px)` }}
      className="absolute inset-x-0 top-0 flex h-16 items-center gap-3 border-b border-line px-1 has-checked:bg-selected"
    >
      <label className="flex min-h-(--cf-size-touch-min) min-w-(--cf-size-touch-min) cursor-pointer items-center justify-center">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={t("trash.select", { name: item.name })} className="size-4 accent-accent" />
      </label>
      <FileIcon kind={item.folder ? "folder" : fileKindOf(item.name)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base" title={item.path}>{item.name}</p>
        <p className="truncate text-sm text-fg-muted" title={item.path}>
          {t("trash.originalPath", { path: item.path })}
        </p>
      </div>
      <div className="shrink-0 text-right text-sm text-fg-muted">
        <p>{t("trash.deleted", { when: when.format(item.deletedAt) })}</p>
        {!item.folder && <p>{formatBytes(item.size)}</p>}
      </div>
    </li>
  );
}

/**
 * Trash (FR-70, FR-71): everything under the `.coffer-trash/` prefix, flattened across batches, with its original
 * path and deletion time. Restore goes through the conflict dialog; Delete forever and Empty trash always ask,
 * and ask for the count to be typed above 50 items and for Empty trash.
 */
export function TrashScreen({ connection, writable, notify, onUseAnotherKey }: TrashScreenProps) {
  const root = connection.prefix ?? "";
  const bucket = connection.bucket ?? "";
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["trash", connection.id, bucket, root],
    queryFn: async ({ signal }) => {
      const { clientFor, listUnder } = await import("@/lib/s3");
      const objects: { key: string; size: number }[] = [];
      for await (const page of listUnder(clientFor(connection), { bucket, prefix: `${root}.coffer-trash/`, signal })) objects.push(...page);
      return toTrashItems(root, objects);
    },
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<DeleteFailure[]>([]);
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  const { ask, dialog: conflictDialog } = useConflictPrompt(bucket);

  const reload = useCallback(() => {
    void queryClient.resetQueries({ queryKey: ["trash", connection.id] });
    void queryClient.resetQueries({ queryKey: ["list", connection.id] });
  }, [queryClient, connection.id]);
  const hooks = useMemo(() => ({ notify, onChanged: reload, onFailures: setFailures }), [notify, reload]);

  const chosen = useMemo(() => items.filter((item) => selection.has(item.key)), [items, selection]);
  const restorable = chosen.filter(canRestore);

  const restore = async () => {
    const { clientFor, existingKeys } = await import("@/lib/s3");
    const client = clientFor(connection);
    try {
      const moves = await planRestore(chosen, items, root, {
        existing: (keys) => existingKeys(client, { bucket, keys }),
        exists: async (key) => (await existingKeys(client, { bucket, keys: [key] })).has(key),
        ask,
      });
      if (moves.length === 0) return;
      startRestore({ connection, moves }, hooks);
      setSelection(new Set());
    } catch {
      notify(t("op.error"));
    }
  };

  const toggle = (key: string) => {
    setSelection((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };
  // Items that are gone (deleted, restored) no longer count: the selection is read against the list.
  const allSelected = items.length > 0 && chosen.length === items.length;
  // Disabled with the reason on screen (the banner), and the buttons point at it for assistive technology.
  const gate = writeGate(!writable);
  const ro = gate.reason;

  const container = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => { setMargin(element.getBoundingClientRect().top + window.scrollY); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => { observer.disconnect(); };
  }, [items.length, failures.length]);
  const virtualizer = useWindowVirtualizer({ count: items.length, estimateSize: () => ROW, overscan: 8, scrollMargin: margin, initialRect: { width: 0, height: typeof window === "undefined" ? 800 : window.innerHeight } });

  return (
    <section data-component="TrashScreen" aria-labelledby="trash-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="trash-title" className="text-xl font-semibold">{t("nav.trash")}</h1>
        <Button
          variant="danger-tonal"
          {...(ro ? { "aria-describedby": READ_ONLY_REASON_ID } : {})}
          disabled={!writable || items.length === 0}
          title={ro}
          onClick={() => { setRequest({ kind: "empty", count: items.length }); }}
        >
          {t("trash.empty")}
        </Button>
      </div>
      <p className="mt-2 text-fg-muted">{t("trash.note", { prefix: ".coffer-trash/" })}</p>
      {!writable && <ReadOnlyNotice className="mt-3" onUseAnotherKey={onUseAnotherKey} />}
      {ro && <p id={READ_ONLY_REASON_ID} className="sr-only">{ro}</p>}

      {failures.length > 0 && (
        <Banner
          tone="danger"
          className="mt-4"
          title={t("trash.failures.title", { count: failures.length })}
          actions={<Button size="sm" onClick={() => { setFailures([]); }}>{t("act.dismiss")}</Button>}
        >
          <ul className="font-mono text-sm break-all">
            {failures.slice(0, 5).map((failure) => <li key={failure.key}>{failure.key}</li>)}
          </ul>
        </Banner>
      )}

      {query.isPending && <p role="status" className="mt-6 text-fg-muted">{t("trash.loading")}</p>}
      {query.isError && (
        <Banner tone="danger" className="mt-6" title={t("trash.error.title")} actions={<Button size="sm" onClick={() => { void query.refetch(); }}>{t("act.retry")}</Button>}>
          {t("trash.error.body")}
        </Banner>
      )}
      {query.isSuccess && items.length === 0 && (
        <div data-component="EmptyState" className="mt-10 text-center">
          <h2 className="text-lg font-semibold">{t("trash.emptyState.title")}</h2>
          <p className="mt-1 text-fg-muted">{t("trash.emptyState.body")}</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div role="toolbar" aria-label={t("trash.toolbar")} className="mt-4 flex min-h-12 flex-wrap items-center gap-2 border-b border-line pb-2">
            <label className="flex min-h-(--cf-size-touch-min) cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => { setSelection(allSelected ? new Set() : new Set(items.map((item) => item.key))); }}
                className="size-4 accent-accent"
              />
              <span aria-live="polite">{chosen.length === 0 ? t("trash.selectAll") : t("sel.count", { n: chosen.length })}</span>
            </label>
            {chosen.length > 0 && (
              <>
                <Button size="sm" disabled={!writable || restorable.length === 0} title={ro} {...(ro ? { "aria-describedby": READ_ONLY_REASON_ID } : {})} onClick={() => { void restore(); }}>
                  <RotateCcw aria-hidden="true" className="size-4" />
                  {t("act.restore")}
                </Button>
                <Button size="sm" variant="danger-tonal" disabled={!writable} title={ro} {...(ro ? { "aria-describedby": READ_ONLY_REASON_ID } : {})} onClick={() => { setRequest({ kind: "keys", items: chosen }); }}>
                  <Trash2 aria-hidden="true" className="size-4" />
                  {t("del.forever")}
                </Button>
              </>
            )}
          </div>
          <ul ref={container} aria-label={t("trash.list")} className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => {
              const item = items[row.index];
              if (!item) return null;
              return (
                <TrashRow key={item.key} item={item} index={row.index} count={items.length} offset={row.start - virtualizer.options.scrollMargin} selected={selection.has(item.key)} onToggle={() => { toggle(item.key); }} />
              );
            })}
          </ul>
        </>
      )}

      {conflictDialog}
      <DeleteForeverDialog
        request={request}
        bucket={bucket}
        onClose={() => { setRequest(null); }}
        onConfirm={(confirmed) => {
          setRequest(null);
          if (confirmed.kind === "empty") startDelete({ connection, total: confirmed.count, prefix: `${root}.coffer-trash/`, owns: (key) => parseTrashKey(root, key) !== null }, hooks);
          else startDelete({ connection, total: confirmed.items.length, keys: confirmed.items.map((item) => item.key) }, hooks);
          setSelection(new Set());
        }}
      />
    </section>
  );
}
