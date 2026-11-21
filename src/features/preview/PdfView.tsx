import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
// Only the URL of the worker file (a separate asset served from 'self', which worker-src allows); the library itself is imported on demand below.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { useObjectBytes } from "./source";
import { type PreviewViewProps, typeLabelOf } from "./types";

/** Over this a PDF is not read into memory to be shown; FR-58 offers Download (AC-53.2). */
export const PDF_LIMIT = 50 * 1024 * 1024;

type Loaded = { state: "working" } | { state: "failed" } | { state: "ready"; pdf: PDFDocumentProxy };

/**
 * A PDF drawn page by page onto a canvas with pdf.js (FR-53): Previous and Next page
 * and "Page N of M". It is its own lazy chunk with the worker as a separate file.
 * Only canvas rendering is used: no annotation or form layer, so links are not
 * followed and PDF scripts never run (the core library has no scripting at all); eval
 * and WebAssembly are off because the CSP forbids both. An encrypted or damaged file
 * falls to FR-58.
 */
export default function PdfView({ connection, file, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem }) {
  const tooLarge = file.size > PDF_LIMIT;
  const bytes = useObjectBytes(connection, file, undefined, !tooLarge);
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded } | null>(null);
  const [page, setPage] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  const data = bytes.state === "ready" ? bytes.value : null;
  useEffect(() => {
    if (data === null) return;
    const state: { cancelled: boolean; opened: PDFDocumentLoadingTask | null } = { cancelled: false, opened: null };
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        // WebAssembly is off because the CSP has no 'wasm-unsafe-eval'; the page is drawn without it.
        const task = pdfjs.getDocument({ data: data.slice(), useWasm: false, verbosity: 0 });
        state.opened = task;
        const pdf = await task.promise;
        if (state.cancelled) return;
        setLoaded({ key: file.key, value: { state: "ready", pdf } });
      } catch {
        if (!state.cancelled) setLoaded({ key: file.key, value: { state: "failed" } });
      }
    })();
    return () => {
      state.cancelled = true;
      void state.opened?.destroy();
    };
  }, [data, file.key]);

  const current = loaded?.key === file.key ? loaded.value : ({ state: "working" } as const);
  const pdf = current.state === "ready" ? current.pdf : null;
  const total = pdf?.numPages ?? 0;

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    const target = canvas.current;
    const state: { cancelled: boolean; task: { cancel: () => void; promise: Promise<unknown> } | null } = { cancelled: false, task: null };
    void (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (state.cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const available = Math.max(200, (stage.current?.clientWidth ?? base.width) - 16);
        const scale = Math.min(2.5, available / base.width);
        const ratio = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale: scale * ratio });
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        target.style.width = `${Math.floor(viewport.width / ratio).toString()}px`;
        target.style.height = `${Math.floor(viewport.height / ratio).toString()}px`;
        // A PDF page is paper: it is drawn on white in both themes, with no annotations (links are not followed).
        state.task = pdfPage.render({ canvas: target, viewport, background: "white", annotationMode: 0 });
        await state.task.promise;
      } catch {
        // A cancelled render (the page changed) is expected; a real failure leaves the canvas blank.
      }
    })();
    return () => {
      state.cancelled = true;
      state.task?.cancel();
    };
  }, [pdf, page]);

  if (tooLarge || bytes.state === "error" || current.state === "failed") return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;
  if (current.state === "working" || bytes.state === "loading") return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;

  const go = (next: number) => { setPage(Math.min(total, Math.max(1, next))); };
  return (
    <div
      className="flex size-full flex-col items-center gap-2 p-2"
      onKeyDown={(event) => {
        if (event.key === "PageDown") { event.preventDefault(); go(page + 1); }
        if (event.key === "PageUp") { event.preventDefault(); go(page - 1); }
      }}
    >
      <div className="flex items-center gap-2">
        <Button variant="ghost" iconOnly aria-label={t("pv.prevPage")} disabled={page <= 1} icon={<ChevronLeft aria-hidden="true" className="size-5" />} onClick={() => { go(page - 1); }} />
        <p role="status" className="text-sm">{t("pv.page", { page, total })}</p>
        <Button variant="ghost" iconOnly aria-label={t("pv.nextPage")} disabled={page >= total} icon={<ChevronRight aria-hidden="true" className="size-5" />} onClick={() => { go(page + 1); }} />
      </div>
      <div ref={stage} tabIndex={0} role="region" aria-label={t("pv.label", { name: file.name })} className="min-h-0 w-full flex-1 overflow-auto text-center">
        <canvas ref={canvas} data-component="PdfPage" className="mx-auto" />
      </div>
    </div>
  );
}
