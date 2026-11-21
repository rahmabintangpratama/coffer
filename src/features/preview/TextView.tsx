import { useMemo } from "react";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/i18n";
import { looksBinary } from "@/lib/s3/keys";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { TEXT_LIMIT, useObjectBytes } from "./source";
import { type PreviewViewProps, typeLabelOf } from "./types";

/**
 * Text and code: the first 1 MiB as plain monospaced text with line numbers and
 * the meta line `{type} · {lines} · {size}` (FR-54). The content is a text node
 * and never HTML (AC-54.3). A file with control characters is binary and falls to
 * FR-58; invalid UTF-8 shows replacement characters.
 */
export function TextView({ connection, file, typeName, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem; typeName: string }) {
  const bytes = useObjectBytes(connection, file, TEXT_LIMIT);
  const truncated = file.size > TEXT_LIMIT;

  const decoded = useMemo(() => {
    if (bytes.state !== "ready" || looksBinary(bytes.value)) return null;
    let text = new TextDecoder("utf-8").decode(bytes.value);
    // A cut in the middle of a character leaves one replacement character at the end.
    if (truncated && text.endsWith("�")) text = text.slice(0, -1);
    const lines = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    const gutter = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
    return { text, lines, gutter };
  }, [bytes, truncated]);

  if (bytes.state === "loading") return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;
  if (bytes.state === "error" || decoded === null) return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;

  return (
    <div className="flex size-full max-w-5xl flex-col gap-2 p-4">
      <p className="text-sm text-(--cf-color-inverse-muted)">{t("pv.code.meta", { type: typeName, lines: decoded.lines, size: formatBytes(file.size) })}</p>
      {truncated && <p role="status" className="text-sm">{t("pv.truncated")}</p>}
      <div role="region" tabIndex={0} aria-label={t("pv.label", { name: file.name })} className="min-h-0 flex-1 overflow-auto rounded-md border border-(--cf-color-inverse-border) p-3 font-mono text-sm">
        <div className="flex min-w-max gap-4">
          <pre aria-hidden="true" className="shrink-0 text-right text-(--cf-color-inverse-muted) select-none">{decoded.gutter}</pre>
          <pre>{decoded.text}</pre>
        </div>
      </div>
    </div>
  );
}
