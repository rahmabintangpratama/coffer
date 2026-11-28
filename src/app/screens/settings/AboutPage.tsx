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
        {__SOURCE_URL__ !== "" && (
          <div>
            <dt className="text-base font-medium">{t("about.sourceLabel")}</dt>
            <dd className="text-sm">
              <a href={__SOURCE_URL__} target="_blank" rel="noopener noreferrer" className="break-all text-accent-fg underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                {__SOURCE_URL__.replace(/^https:\/\//, "")}
              </a>
            </dd>
          </div>
        )}
      </dl>
      <p className="text-base">{t("about.license")}</p>
      {/* The full text is long; it opens on request. */}
      <details data-component="LicenseText" className="rounded-md border border-line bg-surface">
        <summary className="flex min-h-(--cf-size-touch-min) cursor-pointer items-center px-3 text-base font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">{t("about.viewLicense")}</summary>
        <pre tabIndex={0} aria-label={t("about.licenseLabel")} className="max-h-72 overflow-auto border-t border-line p-3 font-sans text-sm whitespace-pre-wrap text-fg-muted">{license ?? t("about.licenseText")}</pre>
      </details>
      <div>
        <h3 className="text-base font-medium">{t("about.fontsLabel")}</h3>
        <p className="text-sm text-fg-muted">{t("about.fonts")}</p>
      </div>
    </section>
  );
}
