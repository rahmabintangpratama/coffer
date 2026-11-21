import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, JournalEntry } from "@/lib/types";
import { discardOperation, resumeOperation, type RunHooks } from "./run";
import { useOperations } from "./state";

const nameOf = (key: string) => {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
};

interface Review {
  state: "loading" | "error" | "ready";
  source: number;
  target: number;
  sourceSample: string[];
  targetSample: string[];
}

/** Live listings of what is at the source and at the target of an interrupted operation (technical-spec 8: Review). */
function ReviewDialog({ connection, entry, onClose }: { connection: ConnectionSummary; entry: JournalEntry | null; onClose: () => void }) {
  const [review, setReview] = useState<{ id: string; value: Review } | null>(null);
  useEffect(() => {
    if (!entry) return;
    const flag = { cancelled: false };
    void (async () => {
      try {
        const { clientFor, countUnder, listUnder } = await import("@/lib/s3");
        const client = clientFor(connection);
        const bucket = connection.bucket ?? "";
        const summarize = async (prefix: string | undefined) => {
          if (prefix === undefined) return { count: 0, sample: [] as string[] };
          if (!prefix.endsWith("/")) {
            const { existingKeys } = await import("@/lib/s3");
            const found = (await existingKeys(client, { bucket, keys: [prefix] })).has(prefix);
            return { count: found ? 1 : 0, sample: found ? [prefix] : [] };
          }
          const count = await countUnder(client, { bucket, prefix });
          const sample: string[] = [];
          for await (const page of listUnder(client, { bucket, prefix })) {
            sample.push(...page.map((object) => object.key));
            break;
          }
          return { count, sample: sample.slice(0, 5) };
        };
        const [source, target] = await Promise.all([summarize(entry.source), summarize(entry.target)]);
        if (!flag.cancelled) setReview({ id: entry.id, value: { state: "ready", source: source.count, target: target.count, sourceSample: source.sample, targetSample: target.sample } });
      } catch {
        if (!flag.cancelled) setReview({ id: entry.id, value: { state: "error", source: 0, target: 0, sourceSample: [], targetSample: [] } });
      }
    })();
    return () => { flag.cancelled = true; };
  }, [entry, connection]);
  const current = entry && review?.id === entry.id ? review.value : { state: "loading" as const, source: 0, target: 0, sourceSample: [], targetSample: [] };

  return (
    <Dialog open={entry !== null} onClose={onClose} title={t("op.review.title", { name: entry ? nameOf(entry.source) : "" })} closeLabel={t("act.close")}>
      {current.state === "loading" && <p role="status">{t("op.review.loading")}</p>}
      {current.state === "error" && <p role="alert" className="text-danger-fg">{t("op.review.error")}</p>}
      {current.state === "ready" && (
        <div className="flex flex-col gap-4">
          {([[t("op.review.source", { count: current.source }), current.sourceSample], [t("op.review.target", { count: current.target }), current.targetSample]] as const).map(([heading, sample]) => (
            <section key={heading}>
              <h3 className="font-semibold">{heading}</h3>
              <ul className="mt-1 font-mono text-sm break-all text-fg-muted">
                {sample.map((key) => <li key={key}>{key}</li>)}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-end"><Button onClick={onClose}>{t("act.close")}</Button></div>
    </Dialog>
  );
}

/**
 * "A move was interrupted" (FR-45, AC-45.2): how far it got, and Resume, Review and Discard. It stays
 * until the person chooses; Discard deletes nothing and says where the objects are (AC-45.4).
 */
export function InterruptedBanner({ connection, notify }: { connection: ConnectionSummary; notify: (message: string, action?: { label: string; run: () => void }) => void }) {
  const entries = useOperations((state) => state.interrupted);
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<JournalEntry | null>(null);
  const hooks: RunHooks = useMemo(
    () => ({
      notify,
      onChanged: () => { void queryClient.resetQueries({ queryKey: ["list", connection.id] }); },
    }),
    [notify, queryClient, connection.id],
  );

  if (entries.length === 0) return null;
  return (
    <div data-component="InterruptedBanner" className="mb-4 flex flex-col gap-2">
      {entries.map((entry) => {
        const failed = entry.failures?.length ?? 0;
        const name = nameOf(entry.source);
        return (
          <Banner
            key={entry.id}
            tone="warning"
            title={t("op.interrupted.title")}
            actions={
              <>
                <Button size="sm" variant="primary" onClick={() => { resumeOperation(connection, entry, hooks); }}>{t("op.resume")}</Button>
                <Button size="sm" onClick={() => { setReviewing(entry); }}>{t("op.review.label")}</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void discardOperation(entry).then(() => { notify(t("op.discarded", { name })); });
                  }}
                >
                  {t("op.discard")}
                </Button>
              </>
            }
          >
            {failed > 0 ? t("op.interrupted.bodyFailed", { done: entry.done, total: entry.total, name, failed }) : t("op.interrupted.body", { done: entry.done, total: entry.total, name })}
          </Banner>
        );
      })}
      <ReviewDialog connection={connection} entry={reviewing} onClose={() => { setReviewing(null); }} />
    </div>
  );
}
