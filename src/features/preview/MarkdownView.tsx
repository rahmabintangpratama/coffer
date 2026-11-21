import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { type PreviewViewProps, typeLabelOf } from "./types";
import { useTextContent } from "./useText";

type Rendered = { state: "working" } | { state: "failed" } | { state: "ready"; fragment: DocumentFragment };

/**
 * Markdown → HTML → sanitized DOM, in two lazy libraries. `html: false` turns raw
 * HTML in the file into text; DOMPurify then keeps an allowlist of tags with no
 * styles, frames or forms; images are removed (a remote image is a tracking
 * request, AC-55.1); links get rel and target, and only http, https and mailto
 * survive. The result is a DocumentFragment, never an HTML string set on the page.
 */
async function render(text: string): Promise<DocumentFragment> {
  const [{ default: MarkdownIt }, { default: DOMPurify }] = await Promise.all([import("markdown-it"), import("dompurify")]);
  const html = new MarkdownIt({ html: false, linkify: true }).render(text);
  const purify = DOMPurify(window);
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "IMG") {
      // Replace the image by its alt text: it is never loaded.
      node.replaceWith(document.createTextNode(node.getAttribute("alt") ?? ""));
    } else if (node.tagName === "A") {
      node.setAttribute("rel", "noopener noreferrer");
      node.setAttribute("target", "_blank");
    }
  });
  return purify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "ul", "ol", "li", "blockquote", "pre", "code", "em", "strong", "del", "s", "a", "table", "thead", "tbody", "tr", "th", "td", "img"],
    ALLOWED_ATTR: ["href", "title", "alt", "src", "rel", "target"],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
    ALLOW_DATA_ATTR: false,
  });
}

/** Rendered Markdown (FR-55). The meta line reads "Markdown · sanitized" (AC-55.2). */
export function MarkdownView({ connection, file, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem }) {
  const content = useTextContent(connection, file);
  const [rendered, setRendered] = useState<{ text: string; value: Rendered } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const text = content.state === "ready" ? content.text : null;

  useEffect(() => {
    if (text === null) return;
    let cancelled = false;
    render(text).then(
      (fragment) => { if (!cancelled) setRendered({ text, value: { state: "ready", fragment } }); },
      () => { if (!cancelled) setRendered({ text, value: { state: "failed" } }); },
    );
    return () => { cancelled = true; };
  }, [text]);

  const current = rendered !== null && rendered.text === text ? rendered.value : undefined;
  const fragment = current?.state === "ready" ? current.fragment : null;
  useEffect(() => {
    if (fragment) container.current?.replaceChildren(fragment);
  }, [fragment]);

  if (content.state === "loading" || (content.state === "ready" && (current === undefined || current.state === "working"))) {
    return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;
  }
  if (content.state !== "ready" || current?.state === "failed") return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;

  return (
    <div className="flex size-full max-w-3xl flex-col gap-2 p-4">
      <p className="text-sm text-(--cf-color-inverse-muted)">{t("pv.md.meta")}</p>
      {content.truncated && <p role="status" className="text-sm">{t("pv.truncated")}</p>}
      <div
        ref={container}
        role="region"
        tabIndex={0}
        aria-label={t("pv.label", { name: file.name })}
        data-component="MarkdownBody"
        className={
          "min-h-0 flex-1 overflow-auto rounded-md border border-(--cf-color-inverse-border) p-4 text-base " +
          "[&_a]:text-(--cf-color-inverse-accent) [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:font-mono " +
          "[&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold " +
          "[&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-auto [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc"
        }
      />
    </div>
  );
}
