import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Field, TextInput } from "@/components/Field";
import { ForgetDialog } from "@/features/vault";
import { t } from "@/lib/i18n";
import { vault, WrongPassphraseError } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { StepFrame } from "./StepFrame";

export interface UnlockScreenProps {
  /** Why the keys are not available: the app just opened, or a lock (auto, manual, or in another tab). */
  reason: "start" | "manual" | "auto" | "remote";
  /** The auto-lock setting that fired, for "It locked after N minutes away". */
  minutes?: number;
  /** The connection that was active before a lock, so the same one opens again (AC-9.5). */
  previousId?: string;
  onUnlocked: (connection: ConnectionSummary, saved: ConnectionSummary[]) => void;
  /** "Use a different connection": leave Unlock and start onboarding. */
  onUseOther: () => void;
  /** The hint said saved connections exist and none do: go to Welcome. */
  onNothingSaved: () => void;
  /** "Stop transfers and lock" (C-38). */
  onStopTransfers: () => void;
  onForget: () => Promise<void>;
}

/** After this many wrong passphrases in a row the button waits, for longer each time. This is for usability, not a defence (technical-spec 9). */
const FREE_TRIES = 3;
const MAX_WAIT_SECONDS = 30;
export const waitAfter = (failures: number): number => (failures < FREE_TRIES ? 0 : Math.min(MAX_WAIT_SECONDS, 2 ** (failures - FREE_TRIES + 1)));

const leaseCount = () => vault.leaseCount();
const subscribeLeases = (listener: () => void) => vault.onLeaseChange(listener);

/** The connection to open after an unlock: the one that was active, else the one used last. */
export function pickConnection(saved: readonly ConnectionSummary[], previousId: string | undefined): ConnectionSummary | undefined {
  const previous = saved.find((connection) => connection.id === previousId);
  if (previous) return previous;
  return [...saved].sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))[0];
}

/**
 * O60, O61 and O62: ask for the passphrase when the app opens with saved connections or after a lock. While transfers
 * still run it says how many and offers to stop them (C-38). The passphrase lives in this component's state until the
 * unlock ends; it is never stored.
 */
export function UnlockScreen({ reason, minutes, previousId, onUnlocked, onUseOther, onNothingSaved, onStopTransfers, onForget }: UnlockScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const [working, setWorking] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [failures, setFailures] = useState(0);
  const [waitLeft, setWaitLeft] = useState(0);
  const [forgetting, setForgetting] = useState(false);
  const transfers = useSyncExternalStore(subscribeLeases, leaseCount);
  const forgetButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let current = true;
    void vault.savedCount().then((count) => { if (current && count === 0) onNothingSaved(); }, () => undefined);
    return () => { current = false; };
  }, [onNothingSaved]);

  useEffect(() => {
    if (waitLeft <= 0) return;
    const timer = setTimeout(() => { setWaitLeft((left) => left - 1); }, 1000);
    return () => { clearTimeout(timer); };
  }, [waitLeft]);

  const title = reason === "start" ? t("ob.unlock.title") : t("ob.locked.title");
  const body =
    reason === "start"
      ? t("ob.unlock.body")
      : reason === "auto"
        ? t("ob.locked.body", { minutes: minutes ?? 0 })
        : reason === "remote"
          ? t("ob.locked.elsewhere")
          : t("ob.locked.manual");

  const submit = async () => {
    if (working || waitLeft > 0 || passphrase === "") return;
    setWorking(true);
    setWrong(false);
    try {
      const saved = await vault.unlock(passphrase);
      const open = pickConnection(saved, previousId);
      if (!open) {
        onNothingSaved();
        return;
      }
      setPassphrase("");
      void vault.touch(open.id).catch(() => undefined);
      onUnlocked(open, saved);
    } catch (error) {
      if (!(error instanceof WrongPassphraseError)) throw error;
      const next = failures + 1;
      setFailures(next);
      setWrong(true);
      setWaitLeft(waitAfter(next));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="cf-root min-h-dvh">
      <div className="cf-app flex min-h-dvh flex-col bg-app text-fg">
        <StepFrame title={title}>
          <p className="text-md text-fg-muted">{body}</p>
          {transfers > 0 && (
            <Banner tone="info" actions={<Button variant="secondary" onClick={onStopTransfers}>{t("ob.locked.stop")}</Button>}>
              {t("ob.locked.transfers", { count: transfers })}
            </Banner>
          )}
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field label={t("ob.unlock.label")} error={wrong ? t("ob.unlock.wrong") : undefined}>
              <TextInput
                type="password"
                value={passphrase}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => { setPassphrase(event.target.value); }}
              />
            </Field>
            {waitLeft > 0 && <p role="status" className="text-sm text-fg-muted">{t("ob.unlock.wait", { seconds: waitLeft })}</p>}
            <Button type="submit" variant="primary" size="lg" block loading={working} disabled={waitLeft > 0 || passphrase === ""}>
              {working ? t("ob.unlock.working") : t("ob.unlock.cta")}
            </Button>
          </form>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={onUseOther}>{t("ob.unlock.other")}</Button>
            <Button ref={forgetButton} variant="link" onClick={() => { setForgetting(true); }} className="self-start">
              {t("ob.unlock.forgetLabel")}
            </Button>
            <p className="text-sm text-fg-muted">{t("ob.unlock.forget.note")}</p>
          </div>
        </StepFrame>
        <ForgetDialog open={forgetting} onClose={() => { setForgetting(false); }} onForget={onForget} returnFocusRef={forgetButton} />
      </div>
    </div>
  );
}
