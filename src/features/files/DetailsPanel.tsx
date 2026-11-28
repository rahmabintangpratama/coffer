import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { HiddenCharsNotice } from "@/components/HiddenCharsNotice";
import { type LayoutMode } from "@/components/layout";
import { Sheet } from "@/components/Sheet";
import { formatBytes } from "@/lib/format";
import { t, type CopyKey } from "@/lib/i18n";
import { revealHiddenChars } from "@/lib/names";
import type { ConnectionSummary, FileItem, FileKind } from "@/lib/types";
import { getClient } from "./client";
import { FileIcon } from "./FileIcon";

const kindLabel: Record<FileKind, CopyKey> = {
  image: "kind.image",
  svg: "kind.svg",
  video: "kind.video",
  audio: "kind.audio",
  pdf: "kind.pdf",
  code: "kind.code",
  markdown: "kind.markdown",
  html: "kind.html",
  archive: "kind.archive",
  unknown: "kind.unknown",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-base break-words">{children}</dd>
    </div>
  );
}

function Body({ connection, file, folder, onCopyKey }: { connection: ConnectionSummary; file: FileItem; folder: string; onCopyKey: () => void }) {
  const bucket = connection.bucket ?? "";
  // The listing has no content type; one HEAD fills it (FR-27).
  const head = useQuery({
    queryKey: ["head", connection.id, bucket, file.key],
    queryFn: async ({ signal }) => {
      const { headObject } = await import("@/lib/s3");
      return headObject(await getClient(connection), { bucket, key: file.key, signal });
    },
  });
  const modified = file.lastModified === "" ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(file.lastModified));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center rounded-md bg-subtle py-6">
        <FileIcon kind={file.fileKind} className="size-12" />
      </div>
      <p className="text-md font-semibold break-words">{revealHiddenChars(file.name)}</p>
      <HiddenCharsNotice names={[file.key]} listed={false} />
      <dl className="flex flex-col gap-3">
        <Field label={t("det.typeLabel")}>{t(kindLabel[file.fileKind])}</Field>
        <Field label={t("det.sizeLabel")}>{t("det.size.value", { size: formatBytes(file.size), bytes: file.size.toLocaleString() })}</Field>
        <Field label={t("det.locationLabel")}>{t("det.location.value", { bucket, folder })}</Field>
        <Field label={t("det.key")}>
          <span className="font-mono text-sm break-all">{revealHiddenChars(file.key)}</span>
          <Button variant="link" size="sm" onClick={onCopyKey} className="ml-2">{t("act.copyKey")}</Button>
        </Field>
        <Field label={t("det.modifiedLabel")}>{modified}</Field>
        <Field label={t("det.etag")}><span className="font-mono text-sm break-all">{file.etag}</span></Field>
        <Field label={t("det.contentType")}>
          {head.isPending ? <span role="status">{t("det.loading")}</span> : head.isError ? <span role="alert">{t("det.error")}</span> : head.data.contentType || t("kind.unknown")}
        </Field>
      </dl>
    </div>
  );
}

/**
 * File details (FR-27): a bottom sheet below 768 px, a 360 px overlay at 768 and
 * an in-layout panel from 1024 px. The file name and key are text nodes. In the
 * viewer the same panel sits beside the file and shows whichever file is on screen.
 */
export function DetailsPanel({ layout, connection, file, folder, onClose, onCopyKey, inViewer = false }: { layout: LayoutMode; connection: ConnectionSummary; file: FileItem | null; folder: string; onClose: () => void; onCopyKey: () => void; /** Inside the dark viewer: an elevated side panel of full height instead of a card in the page. */ inViewer?: boolean }) {
  if (layout === "sidebar") {
    if (!file) return null;
    return (
      <aside
        data-component="DetailsPanel"
        aria-label={t("det.label")}
        {...(inViewer ? { "data-surface": "elevated" } : {})}
        className={
          inViewer
            ? "w-(--cf-size-details-width) shrink-0 overflow-y-auto border-l border-line bg-elevated p-4 text-fg"
            : "w-(--cf-size-details-width) shrink-0 self-start rounded-md border border-line bg-surface p-4"
        }
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("det.label")}</h2>
          <Button variant="ghost" iconOnly aria-label={t("act.close")} icon={<X aria-hidden="true" className="size-5" />} onClick={onClose} />
        </div>
        <Body key={file.key} connection={connection} file={file} folder={folder} onCopyKey={onCopyKey} />
      </aside>
    );
  }
  return (
    <Sheet open={file !== null} onClose={onClose} title={t("det.label")} closeLabel={t("act.close")} side={layout === "compact" ? "bottom" : "end"} component="DetailsPanel">
      {file && <Body key={file.key} connection={connection} file={file} folder={folder} onCopyKey={onCopyKey} />}
    </Sheet>
  );
}
