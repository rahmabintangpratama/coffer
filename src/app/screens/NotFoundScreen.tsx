import { Link } from "wouter";
import { t } from "@/lib/i18n";
import { routes } from "../routes";

/** Shown for a hash that matches no route. */
export function NotFoundScreen() {
  return (
    <section data-component="NotFoundScreen">
      <h1 className="text-xl font-semibold">{t("app.notFound.title")}</h1>
      <p className="mt-2 text-fg-muted">{t("app.notFound.body")}</p>
      <Link href={routes.home} className="mt-4 inline-block text-link underline underline-offset-2">
        {t("app.notFound.cta")}
      </Link>
    </section>
  );
}
