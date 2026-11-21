import { formatBytes } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { type PreviewViewProps, typeLabelOf } from "./types";
import { useTextContent } from "./useText";

/** The numbered source: a gutter and the text side by side, both plain text nodes (AC-54.1, AC-54.3). */
export function CodeBlock({ name, text, gutter }: { name: string; text: string; gutter: string }) {
  return (
    <div role="region" tabIndex={0} aria-label={t("pv.label", { name })} className="min-h-0 flex-1 overflow-auto rounded-md border border-(--cf-color-inverse-border) p-3 font-mono text-sm">
      <div className="flex min-w-max gap-4">
        <pre aria-hidden="true" className="shrink-0 text-right text-(--cf-color-inverse-muted) select-none">{gutter}</pre>
        <pre>{text}</pre>
      </div>
    </div>
  );
}

/**
 * Text and code: the first 1 MiB as plain monospaced text with line numbers and
 * the meta line `{type} · {lines} · {size}` (FR-54). The content is a text node
 * and never HTML (AC-54.3). A file with control characters is binary and falls to
 * FR-58; invalid UTF-8 shows replacement characters.
 */
export function TextView({ connection, file, typeName, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem; typeName: string }) {
  const content = useTextContent(connection, file);
  if (content.state === "loading") return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;
  if (content.state !== "ready") return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;
  return (
    <div className="flex size-full max-w-5xl flex-col gap-2 p-4">
      <p className="text-sm text-(--cf-color-inverse-muted)">{t("pv.code.meta", { type: typeName, lines: content.lines, size: formatBytes(file.size) })}</p>
      {content.truncated && <p role="status" className="text-sm">{t("pv.truncated")}</p>}
      <CodeBlock name={file.name} text={content.text} gutter={content.gutter} />
    </div>
  );
}
