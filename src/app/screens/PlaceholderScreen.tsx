import { t, type CopyKey } from "@/lib/i18n";

/**
 * Stands in for a screen that a later milestone builds. It says so on the page
 * (R-26: no silent dead ends) and carries the real page heading.
 */
export function PlaceholderScreen({ titleKey }: { titleKey: CopyKey }) {
  return (
    <section data-component="PlaceholderScreen">
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-2 text-fg-muted">{t("app.placeholder")}</p>
    </section>
  );
}
