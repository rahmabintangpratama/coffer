import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { t } from "@/lib/i18n";

/** Lock now asks first (AC-9.4): running transfers keep going, and the passphrase brings everything back. */
export function LockDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t("sec.lock.title")} closeLabel={t("act.close")}>
      <p className="text-base">{t("sec.lock.body")}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
        <Button variant="secondary" onClick={onClose}>{t("act.cancel")}</Button>
        <Button
          variant="primary"
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {t("sec.lock.cta")}
        </Button>
      </div>
    </Dialog>
  );
}
