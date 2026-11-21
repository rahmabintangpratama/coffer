import { t } from "@/lib/i18n";

export function LoadError() {
  return (
    <main className="cf-root mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">{t("app.loadError.title")}</h1>
      <p className="mt-2 text-fg-muted">{t("app.loadError.body")}</p>
    </main>
  );
}
