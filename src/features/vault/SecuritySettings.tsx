import { Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { t } from "@/lib/i18n";
import { storedReport, type StoredReport } from "@/lib/storage/forget";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, Settings } from "@/lib/types";
import { ForgetDialog } from "./ForgetDialog";
import { LockDialog } from "./LockDialog";
import { RevealDialog } from "./RevealDialog";

const CHOICES: readonly Settings["autoLockMinutes"][] = [5, 15, 30, 60, 0];

export interface SecuritySettingsProps {
  autoLockMinutes: Settings["autoLockMinutes"];
  onAutoLock: (minutes: Settings["autoLockMinutes"]) => void;
  /** The active connection and the saved ones, for the Connections list. */
  active: ConnectionSummary;
  saved: readonly ConnectionSummary[];
  onLock: () => void;
  onForget: () => Promise<void>;
  /** A saved connection was removed here; the app drops it from its list (and leaves the session when it was the active one). */
  onRemoved: (connection: ConnectionSummary) => void;
  notify: (message: string) => void;
}

/**
 * Security settings (FR-101, FR-102, FR-11): auto-lock choices, Lock now, What's stored on this device, Forget this device,
 * and the connections with Show secret key and Remove. The page layout of M9 holds this as one section.
 */
export function SecuritySettings({ autoLockMinutes, onAutoLock, active, saved, onLock, onForget, onRemoved, notify }: SecuritySettingsProps) {
  const [report, setReport] = useState<StoredReport | null>(null);
  const [locking, setLocking] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [revealing, setRevealing] = useState<ConnectionSummary | null>(null);
  const [removing, setRemoving] = useState<ConnectionSummary | null>(null);
  const revealReturn = useRef<HTMLElement | null>(null);
  const forgetButton = useRef<HTMLButtonElement>(null);
  const unlocked = vault.isUnlocked();

  const load = useCallback(() => { void storedReport().then(setReport, () => { setReport(null); }); }, []);
  useEffect(load, [load, saved.length]);

  const connections = saved.some((connection) => connection.id === active.id) ? saved : [active, ...saved];
  const isSaved = (connection: ConnectionSummary) => saved.some((entry) => entry.id === connection.id);

  return (
    <section data-component="SecuritySettings" aria-labelledby="security-title" className="mt-8">
      <h2 id="security-title" className="text-lg font-semibold">{t("set.securityLabel")}</h2>

      <fieldset className="mt-3">
        <legend className="text-base font-medium">{t("sec.autolockLabel")}</legend>
        <p className="text-sm text-fg-muted">{t("sec.autolock.sub")}</p>
        <div className="mt-1 flex flex-col">
          {CHOICES.map((minutes) => (
            <label key={minutes} className="flex min-h-(--cf-size-touch-min) cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-hover">
              <input type="radio" name="autolock" checked={autoLockMinutes === minutes} onChange={() => { onAutoLock(minutes); }} className="size-5 cursor-pointer accent-accent" />
              <span>{minutes === 0 ? t("sec.autolockNever") : t("sec.autolockValue", { minutes })}</span>
            </label>
          ))}
        </div>
        {autoLockMinutes === 0 && <Banner tone="warning" className="mt-2">{t("sec.autolockNeverWarn")}</Banner>}
      </fieldset>

      <div className="mt-6">
        <h3 className="text-base font-medium">{t("act.lock")}</h3>
        <p className="text-sm text-fg-muted">{unlocked ? t("sec.lock.sub") : t("sec.noSaved")}</p>
        <Button variant="secondary" icon={<Lock aria-hidden="true" className="size-5" />} disabled={!unlocked} onClick={() => { setLocking(true); }} className="mt-2">
          {t("sec.lock.cta")}
        </Button>
      </div>

      <div className="mt-6" data-component="StoredOnDevice">
        <h3 className="text-base font-medium">{t("sec.storedLabel")}</h3>
        <p className="text-sm text-fg-muted">{t("sec.stored.sub")}</p>
        {report && (
          <dl className="mt-2 flex flex-col gap-2">
            <div>
              <dt className="text-base">{t("stored.credsLabel")}</dt>
              <dd className="text-sm text-fg-muted">{t("stored.creds.sub", { count: report.connections })}</dd>
            </div>
            <div>
              <dt className="text-base">{t("stored.journalLabel")}</dt>
              <dd className="text-sm text-fg-muted">{t("stored.journal.sub", { count: report.journal })}</dd>
            </div>
            <div>
              <dt className="text-base">{t("stored.starredLabel")}</dt>
              <dd className="text-sm text-fg-muted">{t("stored.starred.sub", { count: report.starred })}</dd>
            </div>
            <div>
              <dt className="text-base">{t("stored.recentLabel")}</dt>
              <dd className="text-sm text-fg-muted">{t("stored.recent.sub", { count: report.recent })}</dd>
            </div>
          </dl>
        )}
        <p className="mt-2 text-sm text-fg-muted">{t("stored.note")}</p>
      </div>

      <div className="mt-6">
        <h3 className="text-base font-medium">{t("ob.unlock.forgetLabel")}</h3>
        <p className="text-sm text-fg-muted">{t("sec.forget.sub")}</p>
        <Button ref={forgetButton} variant="danger-tonal" onClick={() => { setForgetting(true); }} className="mt-2">{t("sec.forget.btn")}</Button>
      </div>

      <div className="mt-8" data-component="ConnectionsSettings">
        <h2 className="text-lg font-semibold">{t("set.connectionsLabel")}</h2>
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
      </div>

      <LockDialog open={locking} onClose={() => { setLocking(false); }} onConfirm={onLock} />
      <ForgetDialog open={forgetting} onClose={() => { setForgetting(false); }} onForget={onForget} returnFocusRef={forgetButton} />
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
              void vault.remove(target.id).then(() => {
                notify(t("conn.removed", { name: target.name }));
                onRemoved(target);
                load();
              });
            }}
          >
            {t("conn.remove")}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
