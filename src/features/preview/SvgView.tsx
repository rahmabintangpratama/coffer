import { useEffect, useMemo } from "react";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { SVG_LIMIT, useObjectBytes } from "./source";
import { type PreviewViewProps, typeLabelOf } from "./types";

/**
 * An SVG is only ever shown through an <img> (AC-57.1): the bytes become a blob:
 * URL with an explicit image/svg+xml type, so scripts, event handlers and external
 * references inside it never run or load. Over 2 MiB it falls to FR-58 (AC-57.2).
 */
export function SvgView({ connection, file, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem }) {
  const tooLarge = file.size > SVG_LIMIT;
  const bytes = useObjectBytes(connection, file, undefined, !tooLarge);
  // The URL lives as long as the bytes it was made from, then is released.
  const url = useMemo(
    () => (bytes.state === "ready" ? URL.createObjectURL(new Blob([bytes.value as BlobPart], { type: "image/svg+xml" })) : null),
    [bytes],
  );
  useEffect(() => () => { if (url !== null) URL.revokeObjectURL(url); }, [url]);

  if (tooLarge || bytes.state === "error") return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;
  if (bytes.state === "loading" || url === null) return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;
  return (
    <div className="flex size-full flex-col items-center gap-2 p-4">
      <p className="text-sm text-(--cf-color-inverse-muted)">{t("pv.svg.meta")}</p>
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-md bg-surface p-4">
        <img src={url} alt={t("pv.image.alt", { name: file.name })} draggable={false} className="max-h-full max-w-full" />
      </div>
    </div>
  );
}
