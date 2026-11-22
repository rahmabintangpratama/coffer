import { type RefObject, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, TextInput } from "@/components/Field";
import { t } from "@/lib/i18n";
import { vault } from "@/lib/storage/vault";

/**
 * O63: Forget this device (FR-10). It lists what is deleted, says buckets and files are not changed, and when
 * connections are saved asks for their count to be typed before the danger button enables (AC-10.2).
 */
export function ForgetDialog({ open, onClose, onForget, returnFocusRef }: { open: boolean; onClose: () => void; onForget: () => Promise<void>; returnFocusRef?: RefObject<HTMLElement | null> }) {
  return (
    <Dialog open={open} onClose={onClose} title={t("forget.title")} closeLabel={t("act.close")} {...(returnFocusRef ? { returnFocusRef } : {})}>
      {open && <ForgetBody onClose={onClose} onForget={onForget} />}
    </Dialog>
  );
}

function ForgetBody({ onClose, onForget }: { onClose: () => void; onForget: () => Promise<void> }) {
  const [count, setCount] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let current = true;
    void vault.savedCount().then((found) => { if (current) setCount(found); }, () => { if (current) setCount(0); });
    return () => { current = false; };
  }, []);

  const needsCount = count !== null && count > 0;
  const confirmed = count !== null && (!needsCount || typed.trim() === String(count));
  const run = async () => {
    setWorking(true);
    try {
      await onForget();
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <p className="text-base">{t("forget.body")}</p>
      <ul className="mt-2 list-disc ps-5 text-base">
        {needsCount && <li>{t("forget.connections", { count })}</li>}
        <li>{t("forget.journal")}</li>
        <li>{t("forget.local")}</li>
      </ul>
      <p className="mt-3 text-sm text-fg-muted">{t("forget.note")}</p>
      {needsCount && (
        <Field label={t("forget.typeLabel", { count })} className="mt-4">
          <TextInput inputMode="numeric" autoComplete="off" value={typed} onChange={(event) => { setTyped(event.target.value); }} />
        </Field>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
        <Button variant="secondary" onClick={onClose}>{t("act.cancel")}</Button>
        <Button variant="danger" disabled={!confirmed} loading={working} onClick={() => void run()}>
          {working ? t("forget.working") : t("ob.unlock.forgetLabel")}
        </Button>
      </div>
    </>
  );
}
