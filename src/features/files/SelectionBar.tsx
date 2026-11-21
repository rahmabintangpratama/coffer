import { Download, X } from "lucide-react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import { useSelection } from "./selection";
import type { Item } from "./model";

/**
 * The toolbar while items are selected (FR-30): ✕, a live count and the actions
 * that exist so far. Download needs files only (AC-30.3).
 */
export function SelectionBar({ selected, onDownload }: { selected: Item[]; onDownload: (items: Item[]) => void }) {
  const clear = useSelection((state) => state.clear);
  const onlyFiles = selected.every((item) => item.kind === "file");
  return (
    <div
      role="toolbar"
      aria-label={t("sel.toolbar")}
      data-component="SelectionBar"
      className="flex w-full items-center gap-2 rounded-full border border-line bg-elevated px-2 py-1 shadow-overlay"
    >
      <Button variant="ghost" iconOnly aria-label={t("sel.clear")} icon={<X aria-hidden="true" className="size-5" />} onClick={clear} />
      <p role="status" className="flex-1 font-semibold">{t("sel.count", { n: selected.length })}</p>
      <Button variant="ghost" icon={<Download aria-hidden="true" className="size-5" />} disabled={!onlyFiles} onClick={() => { onDownload(selected); }}>
        {t("act.download")}
      </Button>
    </div>
  );
}
