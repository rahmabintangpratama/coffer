import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

/** About (AC-100.3): the version, the origin, the MIT license text and the IBM Plex (OFL) credit. */
export function AboutPage() {
  const [license, setLicense] = useState<string | null>(null);
  // The license text is its own small chunk: it is read only on this page.
  useEffect(() => {
    let current = true;
    void import("../../../../LICENSE?raw").then((module) => { if (current) setLicense(module.default.trim()); }, () => undefined);
    return () => { current = false; };
  }, []);
  return (
    <section data-component="AboutSettings" aria-labelledby="about-title" className="flex flex-col gap-4">
      <h2 id="about-title" className="text-lg font-semibold">{t("set.aboutLabel")}</h2>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-base font-medium">{t("app.name")}</dt>
          <dd className="text-sm text-fg-muted">{t("about.version", { version: __APP_VERSION__ })}</dd>
        </div>
        <div>
          <dt className="text-base font-medium">{t("about.origin")}</dt>
          <dd className="font-mono text-sm break-all text-fg-muted">{window.location.origin}</dd>
        </div>
      </dl>
      <p className="text-base">{t("about.license")}</p>
      <div>
        <h3 className="text-base font-medium">{t("about.licenseLabel")}</h3>
        <pre tabIndex={0} aria-label={t("about.licenseLabel")} className="mt-1 max-h-72 overflow-auto rounded-md border border-line bg-surface p-3 font-sans text-sm whitespace-pre-wrap text-fg-muted">{license ?? t("about.licenseText")}</pre>
      </div>
      <div>
        <h3 className="text-base font-medium">{t("about.fontsLabel")}</h3>
        <p className="text-sm text-fg-muted">{t("about.fonts")}</p>
      </div>
    </section>
  );
}
