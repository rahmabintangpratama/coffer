import { ArrowLeft, ChevronLeft, ChevronRight, Download, Info, Link2, SkipBack, SkipForward } from "lucide-react";
import type { KeyboardEvent } from "react";
import { ActionMenu } from "@/components/ActionMenu";
import { Button } from "@/components/Button";
import { FullscreenDialog } from "@/components/FullscreenDialog";
import { t, type CopyKey } from "@/lib/i18n";
import type { ConnectionSummary, FileItem, FileKind } from "@/lib/types";
import { ImageView } from "./ImageView";
import { MediaView } from "./MediaView";
import { NoPreview } from "./NoPreview";
import { SvgView } from "./SvgView";
import { TextView } from "./TextView";
import { useKind } from "./source";
import { typeLabelOf } from "./types";

const kindLabel: Record<FileKind, CopyKey> = {
  image: "kind.image", svg: "kind.svg", video: "kind.video", audio: "kind.audio", pdf: "kind.pdf",
  code: "kind.code", markdown: "kind.markdown", html: "kind.html", archive: "kind.archive", unknown: "kind.unknown",
};

export interface PreviewProps {
  connection: ConnectionSummary;
  /** The files of the folder in list order; the viewer moves between them. */
  files: readonly FileItem[];
  /** Index into `files` of the file being shown. */
  index: number;
  onClose: () => void;
  /** The viewer has closed and the page is usable again; `index` is the file it was showing. */
  onClosed?: (index: number) => void;
  /** Move to another file by this many places (the owner clamps and updates the address). */
  onStep: (delta: 1 | -1) => void;
  onDownload: (file: FileItem) => void;
  onDetails: (file: FileItem) => void;
  onCopyKey: (file: FileItem) => void;
}

function Body({ connection, file, onSwipe, onDownload }: { connection: ConnectionSummary; file: FileItem; onSwipe: (direction: 1 | -1) => void; onDownload: () => void }) {
  const kind = useKind(connection, file);
  const common = { onSwipe, onDownload };
  if (kind === "loading") return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;
  switch (kind) {
    case "image": return <ImageView connection={connection} file={file} {...common} />;
    case "svg": return <SvgView connection={connection} file={file} {...common} />;
    case "video":
    case "audio": return <MediaView connection={connection} file={file} kind={kind} {...common} />;
    case "code": return <TextView connection={connection} file={file} typeName={t(kindLabel[kind])} {...common} />;
    // PDF, Markdown and HTML arrive in M5b; until then they take the fallback like any type the browser cannot show.
    default: return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;
  }
}

/**
 * The full-screen viewer (FR-50): back, name, "2 of 10", Download, Details and a
 * menu. Previous and next by arrow keys, by a swipe on a phone (in the image view)
 * and by the menu; the position is announced. It is a dialog named "Preview of
 * {name}"; closing returns focus to the row.
 */
export function Preview({ connection, files, index, onClose, onClosed, onStep, onDownload, onDetails, onCopyKey }: PreviewProps) {
  const file = files[index];
  if (!file) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    // Arrow keys seek inside a player and move a caret in a field; leave them there.
    const target = event.target as HTMLElement;
    if (target instanceof HTMLMediaElement || target instanceof HTMLInputElement) return;
    if (event.key === "ArrowRight" && index < files.length - 1) { event.preventDefault(); onStep(1); }
    if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); onStep(-1); }
  };

  const hasPrevious = index > 0;
  const hasNext = index < files.length - 1;
  return (
    <FullscreenDialog label={t("pv.label", { name: file.name })} onClose={onClose} onClosed={() => { onClosed?.(index); }} onKeyDown={onKeyDown}>
      <header className="flex h-(--cf-size-appbar-height) shrink-0 items-center gap-2 border-b border-(--cf-color-inverse-border) px-2">
        <Button variant="ghost" iconOnly aria-label={t("act.back")} icon={<ArrowLeft aria-hidden="true" className="size-6" />} onClick={onClose} />
        <h1 className="min-w-0 flex-1 truncate text-md font-semibold" title={file.name}>{file.name}</h1>
        <p role="status" className="shrink-0 text-sm text-(--cf-color-inverse-muted)">{t("pv.pos", { position: index + 1, total: files.length })}</p>
        <Button variant="ghost" iconOnly aria-label={t("act.download")} icon={<Download aria-hidden="true" className="size-5" />} onClick={() => { onDownload(file); }} />
        <Button variant="ghost" iconOnly aria-label={t("act.details")} icon={<Info aria-hidden="true" className="size-5" />} onClick={() => { onDetails(file); }} />
        <ActionMenu
          component="ContextMenu"
          triggerLabel={t("act.more")}
          title={file.name}
          closeLabel={t("act.close")}
          groups={[
            {
              id: "move",
              actions: [
                { id: "prev", label: t("pv.prev"), icon: <SkipBack aria-hidden="true" className="size-5" />, disabled: !hasPrevious, onSelect: () => { onStep(-1); } },
                { id: "next", label: t("pv.next"), icon: <SkipForward aria-hidden="true" className="size-5" />, disabled: !hasNext, onSelect: () => { onStep(1); } },
              ],
            },
            { id: "file", actions: [{ id: "copyKey", label: t("act.copyKey"), icon: <Link2 aria-hidden="true" className="size-5" />, onSelect: () => { onCopyKey(file); } }] },
          ]}
        />
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {hasPrevious && (
          <Button variant="ghost" iconOnly aria-label={t("pv.prev")} icon={<ChevronLeft aria-hidden="true" className="size-6" />} onClick={() => { onStep(-1); }} className="absolute left-2 z-10 hidden @md:flex" />
        )}
        {/* A new key per file resets zoom, loading and errors. */}
        <Body key={file.key} connection={connection} file={file} onSwipe={onStep} onDownload={() => { onDownload(file); }} />
        {hasNext && (
          <Button variant="ghost" iconOnly aria-label={t("pv.next")} icon={<ChevronRight aria-hidden="true" className="size-6" />} onClick={() => { onStep(1); }} className="absolute right-2 z-10 hidden @md:flex" />
        )}
      </div>
    </FullscreenDialog>
  );
}
