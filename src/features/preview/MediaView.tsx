import { Music } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { useMediaSource } from "./source";
import { type PreviewViewProps, typeLabelOf } from "./types";

/**
 * Video and audio play from a presigned link with native controls and range
 * requests, so large files stream from the provider (AC-52.1). A link that fails
 * is signed again once; a codec the browser cannot play falls to FR-58 (AC-52.2).
 */
export function MediaView({ connection, file, kind, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem; kind: "video" | "audio" }) {
  const { source, retry } = useMediaSource(connection, file, 3600);
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed || source.state === "error") return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;
  if (source.state === "loading") return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;
  const onError = () => {
    if (retried) setFailed(true);
    else {
      setRetried(true);
      retry();
    }
  };
  if (kind === "video") {
    return <video src={source.value} controls playsInline aria-label={t("pv.label", { name: file.name })} onError={onError} className="max-h-full max-w-full" />;
  }
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 p-6">
      <Music aria-hidden="true" className="size-16 text-(--cf-color-inverse-muted)" />
      <audio src={source.value} controls aria-label={t("pv.label", { name: file.name })} onError={onError} className="w-full" />
    </div>
  );
}
