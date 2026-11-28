import { Button } from "@/components/Button";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/i18n";
import { isolate } from "@/lib/names";
import type { ConnectionSummary } from "@/lib/types";
import { estimateRequests, largestFolders, STILL_COUNTING_AT } from "./usage";
import { useUsageScan } from "./useUsageScan";

const whenFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Storage (FR-90, `S30_Storage`): usage is counted only when asked, by listing every object
 * (about one request per 1,000). Idle, calculating, result, error and cancelled.
 */
export function StorageScreen({ connection }: { connection: ConnectionSummary }) {
  const { state, start, cancel } = useUsageScan(connection);
  const { phase, usage, finishedAt } = state;
  const prefix = connection.prefix ?? "";
  const scope = prefix === "" ? (connection.bucket ?? "") : `${connection.bucket ?? ""}/${prefix.replace(/\/$/, "")}`;
  const count = usage.objects.toLocaleString();
  const folders = largestFolders(usage);

  return (
    <section data-component="StorageScreen">
      <h1 className="text-xl font-semibold">{t("nav.storage")}</h1>
      <p className="mt-2 text-fg-muted">{t("stor.scope", { bucket: scope })}</p>

      {phase === "idle" && (
        <div className="mt-6 rounded-md border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">{t("stor.idle.title")}</h2>
          <p className="mt-1 text-fg-muted">{t("stor.idle.body", { bucket: scope })}</p>
          <p className="mt-1 text-sm text-fg-muted">{t("stor.idle.rule")}</p>
          <Button variant="primary" className="mt-4" onClick={start}>{t("stor.calc")}</Button>
        </div>
      )}

      {phase === "running" && (
        <div className="mt-6 rounded-md border border-line bg-surface p-4" aria-busy="true">
          <h2 className="text-lg font-semibold">{t("stor.run.title")}</h2>
          <p role="status" className="mt-1">{t("stor.run.body", { count })} {t("stor.run.requests", { requests: usage.requests.toLocaleString() })}</p>
          {usage.objects >= STILL_COUNTING_AT && (
            <p className="mt-2 text-sm text-fg-muted"><strong className="font-semibold text-fg">{t("stor.still")}.</strong> {t("stor.stillBody")}</p>
          )}
          <Button className="mt-4" onClick={cancel}>{t("act.cancel")}</Button>
        </div>
      )}

      {(phase === "cancelled" || phase === "error") && (
        <div role={phase === "error" ? "alert" : "status"} className="mt-6 rounded-md border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">{phase === "error" ? t("stor.error.title") : t("stor.cancelled.title")}</h2>
          <p className="mt-1 text-fg-muted">{phase === "error" ? t("stor.error.body", { count }) : t("stor.cancelled.body", { count })}</p>
        </div>
      )}

      {(phase === "done" || ((phase === "cancelled" || phase === "error") && usage.objects > 0)) && finishedAt && (
        <div data-component="UsageResult" className="mt-6">
          <p className="text-2xl font-semibold">{formatBytes(usage.bytes)}</p>
          <p className="text-fg-muted">{t("stor.total.sub", { count: usage.objects, when: whenFormat.format(finishedAt) })}</p>
          {phase !== "done" && <p className="mt-1 text-sm font-medium">{t("stor.partial", { count })}</p>}
          {folders.length > 0 && (
            <>
              <h2 className="mt-6 text-md font-semibold">{t("stor.byFolder")}</h2>
              <ul className="mt-2 flex flex-col divide-y divide-line border-y border-line">
                {folders.map((folder) => (
                  <li key={folder.name} className="flex min-h-(--cf-size-row-mobile) items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-medium" title={folder.name === "" ? undefined : isolate(folder.name)}>
                      {folder.name === "" ? t("stor.topLevel") : <bdi>{folder.name}</bdi>}
                    </span>
                    <span className="shrink-0 text-sm text-fg-muted">{t("stor.folderMeta", { size: formatBytes(folder.bytes), count: folder.objects })}</span>
                    <span aria-hidden="true" className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-subtle @md:block">
                      <span className="block h-full bg-accent" style={{ width: `${Math.max(2, Math.round((folder.bytes / Math.max(1, usage.bytes)) * 100)).toString()}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {phase !== "idle" && phase !== "running" && (
        <div className="mt-6">
          {usage.objects > 0 && <p className="mb-2 text-sm text-fg-muted">{t("stor.idle.estimate", { requests: estimateRequests(usage.objects).toLocaleString(), count })}</p>}
          <Button onClick={start}>{t("stor.recalc")}</Button>
        </div>
      )}
    </section>
  );
}
