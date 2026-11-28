import { Database } from "lucide-react";
import { RecentSection } from "@/features/library";
import { getPreset } from "@/lib/providers";
import { t } from "@/lib/i18n";
import type { ConnectionSummary } from "@/lib/types";
import { pathFromPrefix } from "./model";

/** Home (FR-24): the connection's bucket as a card, then Recent files (FR-81). The object count is not known without listing, so it is not shown (AC-24.1 "when known"). */
export function HomeScreen({ connection }: { connection: ConnectionSummary }) {
  const provider = getPreset(connection.providerId).displayName;
  return (
    <section data-component="HomeScreen">
      <h1 className="text-xl font-semibold">{t("nav.home")}</h1>
      {connection.bucket !== undefined && (
        <>
          <h2 className="mt-6 text-md font-semibold">{t("home.buckets")}</h2>
          <ul className="mt-3 grid gap-3 @md:grid-cols-2 @lg:grid-cols-3">
            <li>
              <a
                href={`#${pathFromPrefix("")}`}
                data-component="BucketCard"
                className="flex min-h-(--cf-size-touch-min) items-center gap-3 rounded-md border border-line bg-surface p-4 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Database aria-hidden="true" className="size-6 shrink-0 text-accent" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{connection.bucket}</span>
                  <span className="block truncate text-sm text-fg-muted">{t("home.bucketProvider", { provider })}</span>
                </span>
              </a>
            </li>
          </ul>
        </>
      )}
      <RecentSection connection={connection} />
    </section>
  );
}
