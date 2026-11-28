import { FileIcon } from "@/components/FileIcon";
import { t } from "@/lib/i18n";
import { isolate } from "@/lib/names";
import type { ConnectionSummary } from "@/lib/types";
import { fileHref, locationLabel } from "./links";
import { useRecent } from "./useLibrary";

/** Recent files on Home (FR-81, `S14_Home`): from this browser's history only; hidden while empty (AC-24.2). */
export function RecentSection({ connection }: { connection: ConnectionSummary }) {
  const query = useRecent(connection);
  const items = query.data ?? [];
  if (items.length === 0) return null;
  const bucket = connection.bucket ?? "";
  const root = connection.prefix ?? "";
  return (
    <section data-component="RecentSection" aria-labelledby="recent-heading" className="mt-8">
      <h2 id="recent-heading" className="text-md font-semibold">{t("home.recentLabel")}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t("home.recent.note")}</p>
      <ul className="mt-3 flex flex-col divide-y divide-line border-y border-line">
        {items.map((item) => {
          const folder = locationLabel(bucket, root, item.key);
          return (
            <li key={item.key}>
              <a
                href={fileHref(root, item.key)}
                className="flex min-h-(--cf-size-row-mobile) items-center gap-3 py-2 hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                <FileIcon kind={item.fileKind} className="size-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-medium" title={isolate(item.name)}><bdi>{item.name}</bdi></span>
                  <span className="block truncate text-sm text-fg-muted">{folder}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
