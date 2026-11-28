import { useQuery } from "@tanstack/react-query";
import { StarOff } from "lucide-react";
import { Button } from "@/components/Button";
import { FileIcon } from "@/components/FileIcon";
import { Skeleton } from "@/components/Skeleton";
import { t } from "@/lib/i18n";
import { isolate } from "@/lib/names";
import { fileKindOf } from "@/lib/s3/keys";
import type { ConnectionSummary, StarredItem } from "@/lib/types";
import { fileHref, folderHref, locationLabel, nameOfKey, parentOf } from "./links";
import { useStarActions, useStarred } from "./useLibrary";

/** AC-80.4: which starred keys still exist. Files by HEAD, folders by one listing page; nothing else is read. */
function useExisting(connection: ConnectionSummary, items: readonly StarredItem[]) {
  const bucket = connection.bucket ?? "";
  return useQuery({
    queryKey: ["starred-exists", connection.id, bucket, items.map((item) => item.key).join("\n")],
    enabled: items.length > 0,
    queryFn: async ({ signal }) => {
      const { clientFor, existingKeys, listUnder } = await import("@/lib/s3");
      const client = clientFor(connection);
      const files = items.filter((item) => item.kind === "file").map((item) => item.key);
      const found = await existingKeys(client, { bucket, keys: files, signal });
      for (const folder of items.filter((item) => item.kind === "folder")) {
        for await (const page of listUnder(client, { bucket, prefix: folder.key, signal })) {
          if (page.length > 0) found.add(folder.key);
          break;
        }
      }
      return found;
    },
  });
}

/** Starred (FR-80, `S29_Starred`): items saved in this browser, with their folder; a missing one can be removed. */
export function StarredScreen({ connection, notify }: { connection: ConnectionSummary; notify: (message: string) => void }) {
  const query = useStarred(connection);
  const items = query.data ?? [];
  const existing = useExisting(connection, items);
  const { unstar } = useStarActions(connection, notify);
  const bucket = connection.bucket ?? "";
  const root = connection.prefix ?? "";

  return (
    <section data-component="StarredScreen">
      <h1 className="text-xl font-semibold">{t("nav.starred")}</h1>
      <p className="mt-2 text-fg-muted">{t("star.note")}</p>
      {query.isPending && <Skeleton className="mt-6 h-14 w-full" />}
      {query.isSuccess && items.length === 0 && (
        <div data-component="EmptyState" className="mt-10 text-center">
          <h2 className="text-lg font-semibold">{t("star.empty.title")}</h2>
          <p className="mt-1 text-fg-muted">{t("star.empty.body")}</p>
          <a href="#/files" className="btn-secondary mt-4 inline-flex min-h-(--cf-size-touch-min) items-center rounded-sm border px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("star.empty.cta")}
          </a>
        </div>
      )}
      {items.length > 0 && (
        <ul aria-label={t("star.listLabel")} className="mt-4 flex flex-col divide-y divide-line border-y border-line">
          {items.map((item) => {
            const name = nameOfKey(item.key);
            const folder = locationLabel(bucket, root, item.key);
            const missing = existing.isSuccess && !existing.data.has(item.key);
            return (
              <li key={item.key} data-component="StarredRow" className="flex min-h-(--cf-size-row-mobile) items-center gap-3 py-2">
                <FileIcon kind={item.kind === "folder" ? "folder" : fileKindOf(name)} className="size-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  {missing ? (
                    <span className="block truncate font-medium text-fg-muted" title={isolate(name)}><bdi>{name}</bdi></span>
                  ) : (
                    <a href={item.kind === "folder" ? folderHref(root, item.key) : fileHref(root, item.key)} className="block truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" title={isolate(name)}>
                      <bdi>{name}</bdi>
                    </a>
                  )}
                  {missing ? (
                    <span role="status" className="block text-sm text-danger-fg">{t("star.missing", { bucket })}</span>
                  ) : (
                    <a href={folderHref(root, root + parentOf(root, item.key))} className="block truncate text-sm text-fg-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                      {t("star.location", { folder })}
                    </a>
                  )}
                </div>
                <Button variant="ghost" iconOnly aria-label={`${t("act.unstar")}: ${isolate(name)}`} icon={<StarOff aria-hidden="true" className="size-5" />} onClick={() => { unstar([item]); }} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
