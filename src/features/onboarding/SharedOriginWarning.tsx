import { Banner } from "@/components/Banner";
import { t } from "@/lib/i18n";
import { isSharedOrigin } from "@/lib/shared-origin";

/** Where the deploy guides explain shared origins. */
const GUIDE = "/blob/main/docs/deploy/README.md#serving-under-a-path";

/**
 * The warning on Welcome and Unlock when the app shares its address (AC-1.4, C-61). It cannot be dismissed: the risk
 * lasts as long as the address does.
 */
export function SharedOriginWarning({ base = import.meta.env.BASE_URL, address = window.location }: { base?: string; address?: Pick<Location, "hostname" | "pathname"> }) {
  if (!isSharedOrigin(base, address.hostname, address.pathname)) return null;
  return (
    <div data-component="SharedOriginWarning">
      <Banner tone="warning" title={t("ob.shared.title")}>
        <p>{t("ob.shared.body")}</p>
        {__SOURCE_URL__ !== "" && (
          <a href={`${__SOURCE_URL__}${GUIDE}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-(--cf-size-touch-min) items-center underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("ob.shared.link")}
          </a>
        )}
      </Banner>
    </div>
  );
}
