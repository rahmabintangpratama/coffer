import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Field, PasswordOwner, TextInput } from "@/components/Field";
import { t } from "@/lib/i18n";
import { isStrongPassphrase, passphraseProblem } from "@/lib/storage/crypto";
import { vault, WeakPassphraseError, WrongPassphraseError } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { StepFrame } from "./StepFrame";

/**
 * O51: Save on this device? (FR-8). The first save chooses a passphrase: at least 12 characters, an advisory hint from 16,
 * and a plain note that it cannot be recovered. While the vault is open the other saved connections' passphrase is reused,
 * so nothing is asked. "Not now" keeps the keys in memory only. The passphrase stays in this component's state until
 * the save ends.
 */
export function SaveDeviceScreen({ summary, onSaved, onSkip }: { summary: ConnectionSummary; onSaved: (connection: ConnectionSummary) => void; onSkip: (connection: ConnectionSummary) => void }) {
  const reuse = vault.isUnlocked();
  const [passphrase, setPassphrase] = useState("");
  const [touched, setTouched] = useState(false);
  const [working, setWorking] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [failed, setFailed] = useState(false);
  // Connections are saved but the vault is locked (Add connection from Unlock): the passphrase to give is the existing one.
  const [existing, setExisting] = useState(0);
  useEffect(() => {
    let current = true;
    void vault.savedCount().then((count) => { if (current) setExisting(count); }, () => undefined);
    return () => { current = false; };
  }, []);
  const verifying = !reuse && existing > 0;

  const problem = verifying ? null : passphraseProblem(passphrase);
  const showTooShort = !reuse && !verifying && problem !== null && (touched || passphrase !== "");

  const save = async () => {
    setTouched(true);
    if (working || (!reuse && problem !== null) || (verifying && passphrase === "")) return;
    setWorking(true);
    setWrong(false);
    setFailed(false);
    try {
      await vault.save(summary, reuse ? undefined : passphrase);
      setPassphrase("");
      onSaved(summary);
    } catch (error) {
      if (error instanceof WrongPassphraseError) setWrong(true);
      else if (error instanceof WeakPassphraseError) setTouched(true);
      else setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  return (
    <StepFrame title={t("ob.save.title")}>
      <p className="text-md text-fg-muted">{t("ob.save.body")}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {reuse ? (
          <p className="text-base">{t("ob.save.reuse")}</p>
        ) : (
          <>
            {verifying && <p className="text-base">{t("ob.save.existing")}</p>}
            <PasswordOwner name={t("app.name")} />
            <Field
              label={t("ob.save.label")}
              error={wrong ? t("ob.unlock.wrong") : showTooShort ? t("ob.save.tooShort") : undefined}
              hint={!verifying && !showTooShort && isStrongPassphrase(passphrase) ? t("ob.save.strong") : undefined}
            >
              <TextInput
                type="password"
                name="passphrase"
                value={passphrase}
                autoComplete={verifying ? "current-password" : "new-password"}
                autoCapitalize="none"
                spellCheck={false}
                onBlur={() => { setTouched(true); }}
                onChange={(event) => { setPassphrase(event.target.value); setWrong(false); }}
              />
            </Field>
            {!verifying && <p className="text-sm text-fg-muted">{t("ob.save.nofix")}</p>}
          </>
        )}
        {failed && <p role="alert" className="text-sm text-danger-fg">{t("ob.save.failed")}</p>}
        <Button type="submit" variant="primary" size="lg" block loading={working} disabled={!reuse && (problem !== null || (verifying && passphrase === ""))}>
          {working ? t("ob.save.working") : reuse ? t("ob.save.ctaSame") : t("ob.save.cta")}
        </Button>
        <Button variant="secondary" size="lg" block onClick={() => { onSkip(summary); }}>
          {t("ob.save.skip")}
        </Button>
      </form>
    </StepFrame>
  );
}
