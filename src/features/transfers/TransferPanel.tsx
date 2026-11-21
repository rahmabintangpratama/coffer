import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/Button";
import { formatBytes } from "@/lib/format";
import { t, type CopyKey } from "@/lib/i18n";
import { cancelTransfer, retryTransfer } from "./queue";
import { type OperationRow, type Transfer, useTransfers } from "./store";

const errorCopy: Record<string, CopyKey> = {
  accessDenied: "upl.error.denied",
  network: "upl.error.network",
  cors: "upl.error.cors",
  quota: "upl.error.quota",
  throttled: "upl.error.throttled",
};

function OperationProgress({ row }: { row: OperationRow }) {
  const percent = row.total === 0 ? 0 : Math.floor((row.done / row.total) * 100);
  const text = t("op.progress", { done: row.done.toLocaleString(), total: row.total.toLocaleString() });
  return (
    <li data-component="TransferRow" data-status="running" data-kind="operation" className="py-2">
      <p className="truncate text-base" title={row.name}>{row.title ?? t("op.title", { name: row.name })}</p>
      <div role="progressbar" aria-label={row.title ?? t("op.title", { name: row.name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={text} className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
        <div className="h-full bg-accent" style={{ width: `${percent.toString()}%` }} />
      </div>
      <p className="mt-1 text-sm text-fg-muted">{text}</p>
    </li>
  );
}

function ProgressRow({ transfer }: { transfer: Transfer }) {
  const percent = transfer.size === 0 ? (transfer.status === "done" ? 100 : 0) : Math.floor((transfer.bytesDone / transfer.size) * 100);
  const text =
    transfer.status === "queued"
      ? t("upl.row.queued")
      : transfer.status === "done"
        ? t("upl.row.done")
        : t("upl.progress", { percent, done: formatBytes(transfer.bytesDone), total: formatBytes(transfer.size) });
  const failed = transfer.status === "failed";
  return (
    <li data-component="TransferRow" data-status={transfer.status} className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base" title={transfer.name}>{transfer.name}</p>
        {failed ? (
          <p role="alert" className="text-sm text-danger-fg">{t(errorCopy[transfer.error ?? ""] ?? "upl.error.generic")}</p>
        ) : (
          <>
            <div
              role="progressbar"
              aria-label={transfer.name}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={text}
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle"
            >
              <div className="h-full bg-accent" style={{ width: `${percent.toString()}%` }} />
            </div>
            <p className="mt-1 text-sm text-fg-muted">{text}</p>
          </>
        )}
      </div>
      {failed && <Button size="sm" onClick={() => { retryTransfer(transfer.id); }}>{t("act.retry")}</Button>}
      {transfer.status !== "done" && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={`${t("act.cancelItem")}: ${transfer.name}`}
          icon={<X aria-hidden="true" className="size-4" />}
          onClick={() => { cancelTransfer(transfer.id); }}
        />
      )}
    </li>
  );
}

/**
 * Uploads and the uploads a reload interrupted (FR-44). Full width above the
 * bottom nav below 768 px; 360 px at the bottom right from 768 px. Progress is
 * a role=progressbar with a text value.
 */
export function TransferPanel() {
  const { transfers, interrupted, operations, collapsed, setCollapsed, clearDone, dismissInterrupted } = useTransfers();
  if (transfers.length === 0 && interrupted.length === 0 && operations.length === 0) return null;

  const busy = transfers.filter((transfer) => transfer.status === "queued" || transfer.status === "running").length;
  const failed = transfers.filter((transfer) => transfer.status === "failed").length;
  const done = transfers.filter((transfer) => transfer.status === "done").length;
  const first = operations[0];
  const title =
    busy > 0
      ? t("upl.title.running", { count: busy })
      : first
        ? t("op.title", { name: first.name })
      : failed > 0
        ? t("upl.title.failed", { count: failed })
        : done > 0
          ? t("upl.title.done", { count: done })
          : t("upl.interrupted.title");
  const finished = busy === 0 && operations.length === 0;

  return (
    <section
      aria-label={t("upl.label")}
      data-component="TransferPanel"
      data-surface="elevated"
      className={
        "fixed inset-x-0 bottom-(--cf-size-bnav-height) z-(--cf-z-tray) border-t border-line bg-elevated shadow-overlay " +
        "@md:inset-x-auto @md:right-4 @md:bottom-4 @md:w-(--cf-size-details-width) @md:rounded-lg @md:border"
      }
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <h2 aria-live="polite" className="flex-1 text-base font-semibold">{title}</h2>
        {finished && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDone();
              for (const item of interrupted) dismissInterrupted(item.id);
              for (const transfer of transfers) if (transfer.status === "failed") cancelTransfer(transfer.id);
            }}
          >
            {t("act.dismiss")}
          </Button>
        )}
        <Button
          variant="ghost"
          iconOnly
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("act.show") : t("act.collapse")}
          icon={collapsed ? <ChevronUp aria-hidden="true" className="size-5" /> : <ChevronDown aria-hidden="true" className="size-5" />}
          onClick={() => { setCollapsed(!collapsed); }}
        />
      </div>
      {!collapsed && (
        <ul className="max-h-64 overflow-y-auto px-4 pb-2">
          {interrupted.map((item) => (
            <li key={item.id} data-component="TransferRow" data-status="interrupted" className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">{t("upl.interrupted.title")}</p>
                <p className="text-sm text-fg-muted">{t("upl.interrupted.body", { name: item.name })}</p>
              </div>
              <Button variant="ghost" iconOnly aria-label={t("act.dismiss")} icon={<X aria-hidden="true" className="size-4" />} onClick={() => { dismissInterrupted(item.id); }} />
            </li>
          ))}
          {operations.map((row) => <OperationProgress key={row.id} row={row} />)}
          {transfers.map((transfer) => <ProgressRow key={transfer.id} transfer={transfer} />)}
        </ul>
      )}
    </section>
  );
}
