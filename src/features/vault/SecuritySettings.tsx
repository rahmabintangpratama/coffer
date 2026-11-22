import { Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import { storedReport, type StoredReport } from "@/lib/storage/forget";
import { vault } from "@/lib/storage/vault";
import type { Settings } from "@/lib/types";
import { ForgetDialog } from "./ForgetDialog";
import { LockDialog } from "./LockDialog";

const CHOICES: readonly Settings["autoLockMinutes"][] = [5, 15, 30, 60, 0];

export interface SecuritySettingsProps {
  autoLockMinutes: Settings["autoLockMinutes"];
  onAutoLock: (minutes: Settings["autoLockMinutes"]) => void;
  /** How many connections are saved: What's stored is read again when it changes. */
  savedCount: number;
  onLock: () => void;
  onForget: () => Promise<void>;
}

/** The Security page (FR-101): auto-lock choices, Lock now, What's stored on this device and Forget this device. */
export function SecuritySettings({ autoLockMinutes, onAutoLock, savedCount, onLock, onForget }: SecuritySettingsProps) {
  const [report, setReport] = useState<StoredReport | null>(null);
  const [locking, setLocking] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const forgetButton = useRef<HTMLButtonElement>(null);
  const unlocked = vault.isUnlocked();

  const load = useCallback(() => { void storedReport().then(setReport, () => { setReport(null); }); }, []);
  useEffect(load, [load, savedCount]);

  return (
    <section data-component="SecuritySettings" aria-labelledby="security-title">
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
              <dt className="text-base">{t("stored.uploadsLabel")}</dt>
              <dd className="text-sm text-fg-muted">{t("stored.uploads.sub", { count: report.uploads })}</dd>
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

      <LockDialog open={locking} onClose={() => { setLocking(false); }} onConfirm={onLock} />
      <ForgetDialog open={forgetting} onClose={() => { setForgetting(false); }} onForget={onForget} returnFocusRef={forgetButton} />
    </section>
  );
}
