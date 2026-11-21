import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";

/** O44: the write test was denied while list and read passed. Offers a read-only connection (FR-110). */
export function ReadOnlyOffer({
  readVerified,
  onConnectReadOnly,
  onEditKeys,
}: {
  /** False when the bucket was empty, so reading could not be proven. */
  readVerified: boolean;
  onConnectReadOnly: () => void;
  onEditKeys: () => void;
}) {
  return (
    <div data-component="ReadOnlyOffer" className="flex flex-col gap-4">
      <Banner tone="info" title={t("ob.ro.title")}>
        <p>{t("ob.ro.why")}</p>
        <p className="mt-1">{t("ob.ro.body")}</p>
        {readVerified ? null : <p className="mt-1">{t("ob.ro.unverified")}</p>}
      </Banner>
      <div className="flex flex-col gap-2 @md:flex-row">
        <Button variant="primary" onClick={onConnectReadOnly}>
          {t("ob.ro.cta")}
        </Button>
        <Button variant="secondary" onClick={onEditKeys}>
          {t("ob.fail.sig.cta")}
        </Button>
      </div>
    </div>
  );
}
