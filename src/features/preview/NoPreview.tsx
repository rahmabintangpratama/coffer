import { Download, FileQuestion } from "lucide-react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";

/** The fallback for a type that cannot be shown (FR-58, AC-58.1): what it is, and a way to get the file. */
export function NoPreview({ type, onDownload }: { type: string; onDownload: () => void }) {
  return (
    <div role="status" data-component="NoPreview" className="flex max-w-md flex-col items-center gap-3 p-6 text-center">
      <FileQuestion aria-hidden="true" className="size-12 text-(--cf-color-inverse-muted)" />
      <h2 className="text-lg font-semibold">{t("pv.none.title")}</h2>
      <p className="text-(--cf-color-inverse-muted)">{t("pv.none.body", { type })}</p>
      <Button variant="primary" icon={<Download aria-hidden="true" className="size-5" />} onClick={onDownload}>
        {t("act.download")}
      </Button>
    </div>
  );
}
