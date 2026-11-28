import { Copy } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, PasswordOwner, TextInput } from "@/components/Field";
import { t } from "@/lib/i18n";
import { vault, WrongPassphraseError } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";

/** How long the secret stays visible (AC-102.2). */
export const REVEAL_SECONDS = 15;

/**
 * Show secret key (FR-102). The passphrase is typed again and the key derived afresh for this one call; the secret
 * lives in this component's state for 15 seconds, then it is cleared and the form comes back. Closing the dialog
 * clears it at once. It never appears in a toast, a title, the address or an error.
 */
export function RevealDialog({ connection, onClose, notify, returnFocusRef }: { connection: ConnectionSummary | null; onClose: () => void; notify: (message: string) => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  return (
    <Dialog open={connection !== null} onClose={onClose} title={t("reveal.title")} closeLabel={t("act.close")} {...(returnFocusRef ? { returnFocusRef } : {})}>
      {/* The body remounts for every connection and unmounts on close, so a typed passphrase or a shown secret never outlives it. */}
      {connection && <RevealBody key={connection.id} connection={connection} onClose={onClose} notify={notify} />}
    </Dialog>
  );
}

function RevealBody({ connection, onClose, notify }: { connection: ConnectionSummary; onClose: () => void; notify: (message: string) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (secret === null) return;
    const timer = setTimeout(() => { setSecret(null); }, REVEAL_SECONDS * 1000);
    return () => { clearTimeout(timer); };
  }, [secret]);

  const reveal = async () => {
    if (working || passphrase === "") return;
    setWorking(true);
    setWrong(false);
    setFailed(false);
    try {
      setSecret(await vault.reveal(connection.id, passphrase));
      setPassphrase("");
    } catch (error) {
      if (error instanceof WrongPassphraseError) setWrong(true);
      else setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    if (secret === null) return;
    try {
      await navigator.clipboard.writeText(secret);
      notify(t("sec.clipboard"));
    } catch {
      // The clipboard can be refused; the secret stays on screen for the person to copy by hand.
    }
  };

  return (
    <div data-component="RevealSecret">
      <p className="text-base">{t("reveal.body", { name: connection.name })}</p>
      {secret === null ? (
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void reveal();
          }}
        >
          <PasswordOwner name={t("app.name")} />
          <Field label={t("ob.unlock.label")} error={wrong ? t("reveal.wrong") : undefined}>
            <TextInput type="password" name="passphrase" value={passphrase} autoComplete="current-password" autoCapitalize="none" spellCheck={false} onChange={(event) => { setPassphrase(event.target.value); }} />
          </Field>
          {failed && <p role="alert" className="text-sm text-danger-fg">{t("reveal.failed")}</p>}
          <div className="flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
            <Button variant="secondary" onClick={onClose}>{t("act.cancel")}</Button>
            <Button type="submit" variant="primary" loading={working} disabled={passphrase === ""}>{t("reveal.cta")}</Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm font-semibold">{t("reveal.secretLabel")}</p>
          <code data-testid="revealed-secret" className="block rounded-md border border-line bg-surface px-3 py-3 font-mono text-sm break-all select-all">{secret}</code>
          <p role="status" className="text-sm text-fg-muted">{t("reveal.note", { seconds: REVEAL_SECONDS })}</p>
          <div className="flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
            <Button variant="secondary" onClick={() => { setSecret(null); }}>{t("reveal.hide")}</Button>
            <Button variant="primary" icon={<Copy aria-hidden="true" className="size-5" />} onClick={() => void copy()}>{t("reveal.copy")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
