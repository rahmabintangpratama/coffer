import { Button } from "@/components/Button";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { t } from "@/lib/i18n";

/** S41: the reason a read-only connection cannot change files, with "Use another key" (AC-111.1). */
export function ReadOnlyNotice({ onUseAnotherKey, className }: { onUseAnotherKey: () => void; className?: string }) {
  return (
    <ReadOnlyBanner
      title={t("ro.reason")}
      {...(className === undefined ? {} : { className })}
      action={<Button size="sm" variant="secondary" onClick={onUseAnotherKey}>{t("ro.banner.cta")}</Button>}
    >
      {t("ro.banner.body")}
    </ReadOnlyBanner>
  );
}
