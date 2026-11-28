import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { FileIcon } from "@/components/FileIcon";
import { t } from "@/lib/i18n";
import { isolate } from "@/lib/names";
import { fileKindOf } from "@/lib/s3/keys";
import type { ConnectionSummary } from "@/lib/types";
import { MATCH_PAGE, matchKeys, SCAN_CAP, searchable } from "./searchAll";
import { pathFromPrefix } from "./model";

type Phase = "running" | "done" | "capped" | "cancelled" | "error";

/**
 * "Search all of {bucket}" (AC-23.6): lists every key under the root with no delimiter, page by
 * page, up to SCAN_CAP keys, keeping names only. Typing in the pill filters what was scanned, with
 * no new requests. Each match links to itself and to its folder. Leaving cancels the scan.
 */
export default function BucketSearch({ connection, root, query, showHidden, onBack }: { connection: ConnectionSummary; root: string; query: string; showHidden: boolean; onBack: () => void }) {
  const bucket = connection.bucket ?? "";
  const [keys, setKeys] = useState<string[]>([]);
  const [scanned, setScanned] = useState(0);
  const [phase, setPhase] = useState<Phase>("running");
  // How many matches show, per query: a new query starts again from one page.
  const [paging, setPaging] = useState({ query, shown: MATCH_PAGE });
  const shown = paging.query === query ? paging.shown : MATCH_PAGE;
  const [controller] = useState(() => new AbortController());

  useEffect(() => {
    let count = 0;
    let found: string[] = [];
    void (async () => {
      try {
        const { clientFor, listUnder } = await import("@/lib/s3");
        for await (const page of listUnder(clientFor(connection), { bucket, prefix: root, signal: controller.signal })) {
          count += page.length;
          found = found.concat(page.flatMap((object) => (searchable(object.key, root, showHidden) ? [object.key] : [])));
          setScanned(count);
          setKeys(found);
          if (count >= SCAN_CAP) {
            controller.abort();
            setPhase("capped");
            return;
          }
        }
        setPhase("done");
      } catch {
        setPhase((current) => (current === "capped" ? current : controller.signal.aborted ? "cancelled" : "error"));
      }
    })();
    return () => { controller.abort(); };
  }, [bucket, connection, controller, root, showHidden]);

  const matches = useMemo(() => matchKeys(keys, query), [keys, query]);
  const count = scanned.toLocaleString();
  const status =
    phase === "running" ? t("search.everywhere.running", { count })
      : phase === "done" ? t("search.everywhere.done", { count, bucket })
        : phase === "capped" ? t("search.everywhere.capped", { count, bucket })
          : phase === "cancelled" ? t("search.everywhere.cancelled", { count })
            : t("search.everywhere.error", { count });

  return (
    <section data-component="BucketSearch" aria-labelledby="bucket-search-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="bucket-search-title" className="min-w-0 flex-1 text-lg font-semibold">{t("search.everywhere.title", { bucket })}</h2>
        {phase === "running" && <Button size="sm" onClick={() => { controller.abort(); }}>{t("act.cancel")}</Button>}
        <Button size="sm" variant="ghost" icon={<X aria-hidden="true" className="size-4" />} onClick={onBack}>{t("search.everywhere.back")}</Button>
      </div>
      <p role="status" aria-live="polite" className={phase === "error" ? "text-danger-fg" : "text-fg-muted"}>
        {status} {t("search.everywhere.matches", { count: matches.length })}
      </p>
      {!showHidden && <p className="text-sm text-fg-muted">{t("search.everywhere.hint")}</p>}
      {phase !== "running" && matches.length === 0 && <p className="py-8 text-center">{t("search.everywhere.none", { bucket, q: query.trim() })}</p>}
      {matches.length > 0 && (
        <ul aria-label={t("search.everywhere.listLabel", { bucket })} className="flex flex-col divide-y divide-line border-y border-line">
          {matches.slice(0, shown).map((key) => {
            const folderKey = key.endsWith("/");
            const relative = key.slice(root.length);
            const trimmed = folderKey ? relative.slice(0, -1) : relative;
            const cut = trimmed.lastIndexOf("/");
            const name = trimmed.slice(cut + 1);
            const parent = cut === -1 ? "" : trimmed.slice(0, cut + 1);
            const folder = parent === "" ? bucket : `${bucket}/${parent.slice(0, -1)}`;
            const href = folderKey ? `#${pathFromPrefix(relative)}` : `#${pathFromPrefix(parent)}?preview=${encodeURIComponent(key)}`;
            return (
              <li key={key} data-component="SearchResult" className="flex min-h-(--cf-size-row-mobile) items-center gap-3 py-2">
                <FileIcon kind={folderKey ? "folder" : fileKindOf(name)} className="size-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  <a href={href} className="block truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" title={isolate(name)}>
                    <bdi>{name}</bdi>
                  </a>
                  <a href={`#${pathFromPrefix(parent)}`} className="block truncate text-sm text-fg-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    {t("search.everywhere.inFolder", { folder })}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > shown && (
        <Button className="self-start" onClick={() => { setPaging({ query, shown: shown + MATCH_PAGE }); }}>{t("search.everywhere.loadMore")}</Button>
      )}
    </section>
  );
}
