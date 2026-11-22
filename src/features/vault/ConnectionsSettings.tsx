import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { t } from "@/lib/i18n";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { RevealDialog } from "./RevealDialog";

export interface ConnectionsSettingsProps {
  /** The active connection and the saved ones. */
  active: ConnectionSummary;
  saved: readonly ConnectionSummary[];
  /** A saved connection was removed here; the app drops it from its list (and leaves the session when it was the active one). */
  onRemoved: (connection: ConnectionSummary) => void;
  notify: (message: string) => void;
}

/** The Connections page (FR-11, FR-102): each connection with Show secret key and Remove. */
export function ConnectionsSettings({ active, saved, onRemoved, notify }: ConnectionsSettingsProps) {
  const [revealing, setRevealing] = useState<ConnectionSummary | null>(null);
  const [removing, setRemoving] = useState<ConnectionSummary | null>(null);
  const revealReturn = useRef<HTMLElement | null>(null);
  const connections = saved.some((connection) => connection.id === active.id) ? saved : [active, ...saved];
  const isSaved = (connection: ConnectionSummary) => saved.some((entry) => entry.id === connection.id);

  return (
    <section data-component="ConnectionsSettings" aria-labelledby="connections-title">
      <h2 id="connections-title" className="text-lg font-semibold">{t("set.connectionsLabel")}</h2>
      <p className="text-sm text-fg-muted">{t("set.connections.sub", { count: connections.length })}</p>
      <ul aria-label={t("conn.listLabel")} className="mt-2 flex flex-col divide-y divide-line">
        {connections.map((connection) => (
          <li key={connection.id} className="flex flex-col gap-2 py-3">
            <div className="min-w-0">
              <p className="truncate text-base">{connection.name}</p>
              <p className="truncate text-sm text-fg-muted">{isSaved(connection) ? t("stored.creds.sub", { count: 1 }) : t("conn.notSaved")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
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
                <Button size="sm" variant="danger-tonal" aria-label={`${t("conn.remove")}: ${connection.name}`} onClick={() => { setRemoving(connection); }}>
                  {t("conn.remove")}
                </Button>
              )}
            </div>
            {!isSaved(connection) && <p className="text-sm text-fg-muted">{t("reveal.memoryOnly")}</p>}
          </li>
        ))}
      </ul>

      <RevealDialog connection={revealing} onClose={() => { setRevealing(null); }} notify={notify} returnFocusRef={revealReturn} />
      <Dialog open={removing !== null} onClose={() => { setRemoving(null); }} title={t("conn.removeTitle", { name: removing?.name ?? "" })} closeLabel={t("act.close")}>
        <p className="text-base">{t("conn.removeBody")}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
          <Button variant="secondary" onClick={() => { setRemoving(null); }}>{t("act.cancel")}</Button>
          <Button
            variant="danger"
            onClick={() => {
              const target = removing;
              setRemoving(null);
              if (!target) return;
              void vault.remove(target.id).then(
                () => {
                  notify(t("conn.removed", { name: target.name }));
                  onRemoved(target);
                },
                () => { notify(t("conn.removeFailed", { name: target.name })); },
              );
            }}
          >
            {t("conn.remove")}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
