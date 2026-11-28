import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { getPreset } from "@/lib/providers";
import { t } from "@/lib/i18n";
import { nameOfEntry } from "@/lib/storage/journal";
import type { ConnectionSummary, JournalEntry } from "@/lib/types";
import { type ConnectionTools, RenameConnectionDialog, TestConnectionDialog } from "./ConnectionTools";
import { RevealDialog } from "./RevealDialog";

/** What Remove needs from the app (OQ-37, C-55); the page owns only the dialogs. */
export interface ConnectionRemoval {
  /** Read what is stored for the connection: unfinished moves (`live` ones are still running) and the counts to list. */
  inspect: (connection: ConnectionSummary) => Promise<RemovalPlan>;
  resume: (connection: ConnectionSummary, entry: JournalEntry) => void;
  discard: (entry: JournalEntry) => Promise<void>;
  /** Stop its transfers, abort its unfinished uploads, delete its rows and keys. Resolves with how the aborts went. */
  remove: (connection: ConnectionSummary) => Promise<{ aborted: number; failed: number }>;
}

export interface RemovalPlan {
  unfinished: { entry: JournalEntry; live: boolean }[];
  transfers: number;
  uploads: number;
  starred: number;
  recent: number;
}

export interface ConnectionsSettingsProps {
  /** The active connection and the saved ones. */
  active: ConnectionSummary;
  saved: readonly ConnectionSummary[];
  removal: ConnectionRemoval;
  /** Add, Test and Rename (M11). */
  tools: ConnectionTools;
  /** A saved connection was renamed here; the app updates its list. */
  onRenamed: (connection: ConnectionSummary) => void;
  /** A saved connection was removed here; the app drops it from its list (and leaves the session when it was the active one). */
  onRemoved: (connection: ConnectionSummary) => void;
  notify: (message: string) => void;
}

type Step = { kind: "blocked"; connection: ConnectionSummary; plan: RemovalPlan } | { kind: "confirm"; connection: ConnectionSummary; plan: RemovalPlan };

/** The Connections page (FR-11, FR-102): each connection with Show secret key and Remove. */
export function ConnectionsSettings({ active, saved, removal, tools, onRenamed, onRemoved, notify }: ConnectionsSettingsProps) {
  const [testing, setTesting] = useState<ConnectionSummary | null>(null);
  const [renaming, setRenaming] = useState<ConnectionSummary | null>(null);
  const [revealing, setRevealing] = useState<ConnectionSummary | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const revealReturn = useRef<HTMLElement | null>(null);
  const connections = saved.some((connection) => connection.id === active.id) ? saved : [active, ...saved];
  const isSaved = (connection: ConnectionSummary) => saved.some((entry) => entry.id === connection.id);

  // An unfinished move blocks the removal: without its journal entry it would be lost without a banner (C-55).
  const review = async (connection: ConnectionSummary) => {
    try {
      const plan = await removal.inspect(connection);
      setStep({ kind: plan.unfinished.length > 0 ? "blocked" : "confirm", connection, plan });
    } catch {
      notify(t("conn.removeFailed", { name: connection.name }));
    }
  };

  const confirmRemove = async (connection: ConnectionSummary) => {
    setBusy(true);
    try {
      const { aborted, failed } = await removal.remove(connection);
      const total = aborted + failed;
      notify(total === 0 ? t("conn.removed", { name: connection.name }) : t(failed === 0 ? "conn.removedUploads" : "conn.removedUploadsFailed", { name: connection.name, aborted, total, failed }));
      setStep(null);
      onRemoved(connection);
    } catch {
      setStep(null);
      notify(t("conn.removeFailed", { name: connection.name }));
    } finally {
      setBusy(false);
    }
  };

  const blocked = step?.kind === "blocked" ? step : null;
  const confirming = step?.kind === "confirm" ? step : null;
  const counts = confirming
    ? [
        confirming.plan.transfers > 0 ? t("conn.removeTransfers", { count: confirming.plan.transfers }) : null,
        confirming.plan.uploads > 0 ? t("conn.removeUploads", { count: confirming.plan.uploads }) : null,
        confirming.plan.starred > 0 ? t("conn.removeStarred", { count: confirming.plan.starred }) : null,
        confirming.plan.recent > 0 ? t("conn.removeRecent", { count: confirming.plan.recent }) : null,
      ].filter((line): line is string => line !== null)
    : [];

  return (
    <section data-component="ConnectionsSettings" aria-labelledby="connections-title">
      <h2 id="connections-title" className="text-lg font-semibold">{t("set.connectionsLabel")}</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{t("set.connections.sub", { count: connections.length })}</p>
        <Button size="sm" variant="secondary" onClick={tools.add}>{t("conn.add")}</Button>
      </div>
      <ul aria-label={t("conn.listLabel")} className="mt-2 flex flex-col divide-y divide-line">
        {connections.map((connection) => (
          <li key={connection.id} className="flex flex-col gap-2 py-3">
            <div className="min-w-0">
              <p className="truncate text-base">{connection.name}</p>
              <p className="truncate text-sm text-fg-muted">
                {t("conn.subtitle", {
                  connection: connection.bucket === undefined ? getPreset(connection.providerId).displayName : t("conn.name", { provider: getPreset(connection.providerId).displayName, bucket: connection.bucket }),
                  state: isSaved(connection) ? t("conn.encrypted") : t("conn.notSaved"),
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" aria-label={`${t("conn.test")}: ${connection.name}`} onClick={() => { setTesting(connection); }}>
                {t("conn.test")}
              </Button>
              {isSaved(connection) && (
                <Button size="sm" variant="secondary" aria-label={`${t("conn.rename")}: ${connection.name}`} onClick={() => { setRenaming(connection); }}>
                  {t("conn.rename")}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={!isSaved(connection)}
                aria-label={`${t("reveal.title")}: ${connection.name}`}
                onClick={(event) => { revealReturn.current = event.currentTarget; setRevealing(connection); }}
              >
                {t("reveal.title")}
              </Button>
              {isSaved(connection) && (
                <Button size="sm" variant="danger-tonal" aria-label={`${t("conn.remove")}: ${connection.name}`} onClick={() => { void review(connection); }}>
                  {t("conn.remove")}
                </Button>
              )}
            </div>
            {!isSaved(connection) && <p className="text-sm text-fg-muted">{t("reveal.memoryOnly")}</p>}
          </li>
        ))}
      </ul>

      <TestConnectionDialog connection={testing} tools={tools} onClose={() => { setTesting(null); }} />
      <RenameConnectionDialog
        connection={renaming}
        tools={tools}
        onClose={() => { setRenaming(null); }}
        onRenamed={(next) => { onRenamed(next); notify(t("conn.renamed", { name: next.name })); }}
      />
      <RevealDialog connection={revealing} onClose={() => { setRevealing(null); }} notify={notify} returnFocusRef={revealReturn} />

      <Dialog open={blocked !== null} onClose={() => { setStep(null); }} title={t("conn.blockedTitle")} closeLabel={t("act.close")}>
        {blocked && (
          <>
            <p className="text-base">{t("conn.blockedBody", { name: blocked.connection.name, count: blocked.plan.unfinished.length })}</p>
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {blocked.plan.unfinished.map(({ entry, live }) => (
                <li key={entry.id} className="flex flex-col gap-2 py-3">
                  <p className="text-base break-words">{t("conn.blockedEntry", { name: nameOfEntry(entry), done: entry.done, total: entry.total })}</p>
                  {live ? (
                    <p className="text-sm text-fg-muted">{t("conn.blockedLive")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="primary" onClick={() => { removal.resume(blocked.connection, entry); setStep(null); }}>{t("op.resume")}</Button>
                      <Button size="sm" onClick={() => { void removal.discard(entry).then(() => review(blocked.connection)); }}>{t("op.discard")}</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={() => { setStep(null); }}>{t("act.close")}</Button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog open={confirming !== null} onClose={() => { if (!busy) setStep(null); }} title={t("conn.removeTitle", { name: confirming?.connection.name ?? "" })} closeLabel={t("act.close")}>
        <p className="text-base">{t("conn.removeBody")}</p>
        <ul className="mt-3 list-disc pl-5 text-base">
          <li>{t("conn.removeKeys")}</li>
          {counts.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <p className="mt-3 text-sm text-fg-muted">{t("conn.removeKeep")}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
          <Button variant="secondary" disabled={busy} onClick={() => { setStep(null); }}>{t("act.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => { if (confirming) void confirmRemove(confirming.connection); }}>
            {t("conn.remove")}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
