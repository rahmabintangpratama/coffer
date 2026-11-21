import { Code, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { CodeBlock } from "./TextView";
import { type PreviewViewProps, typeLabelOf } from "./types";
import { useTextContent } from "./useText";

/**
 * A page that locks its own network down before anything of the file is parsed. The
 * srcdoc document inherits the app's CSP, which already forbids scripts; this meta
 * adds `default-src 'none'`, so remote images, frames and stylesheets in the file
 * are not requested either (nothing leaves the browser for a hostile page). Our own
 * doctype comes first so the meta sits in the head before any resource is found.
 */
const LOCK = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">';

/**
 * HTML opens as source (FR-56, AC-56.1): "Shown as code for your safety." `Render in
 * sandbox` shows it in an iframe with `sandbox=""` (no scripts, no same origin, no
 * forms, no popups) (AC-56.2). The page goes in `srcdoc`, not a blob: URL: a blob:
 * document inherits the app's CSP including `frame-ancestors 'none'`, which WebKit
 * enforces, so Safari showed an empty frame (D-39). Styles inside the file may still
 * be blocked by the inherited CSP; the notice says so (C-23).
 */
export function HtmlView({ connection, file, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem }) {
  const content = useTextContent(connection, file);
  const [rendered, setRendered] = useState(false);

  if (content.state === "loading") return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;
  if (content.state !== "ready") return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;

  return (
    <div className="flex size-full max-w-5xl flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-(--cf-color-inverse-muted)">{t("pv.html.meta", { type: "HTML", size: formatBytes(file.size) })}</p>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={rendered}
          icon={rendered ? <Code aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          onClick={() => { setRendered(!rendered); }}
        >
          {rendered ? t("pv.html.source") : t("pv.html.render")}
        </Button>
      </div>
      {rendered ? (
        <>
          <p role="status" className="text-sm">{t("pv.html.sandboxNote")}</p>
          <iframe
            sandbox=""
            srcDoc={`${LOCK}${content.text}`}
            title={t("pv.html.frameTitle", { name: file.name })}
            referrerPolicy="no-referrer"
            allow=""
            className="min-h-0 flex-1 rounded-md bg-surface"
          />
        </>
      ) : (
        <>
          <p role="status" className="text-sm">{t("pv.html.notice")}</p>
          {content.truncated && <p role="status" className="text-sm">{t("pv.truncated")}</p>}
          <CodeBlock name={file.name} text={content.text} gutter={content.gutter} />
        </>
      )}
    </div>
  );
}
