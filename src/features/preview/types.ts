import { t } from "@/lib/i18n";
import type { FileItem } from "@/lib/types";

export interface PreviewViewProps {
  /** Move to the next (1) or previous (-1) file: a swipe on a phone. */
  onSwipe: (direction: 1 | -1) => void;
  onDownload: () => void;
}

/** What to call a file's type in "{type} files can't be shown": its extension in capitals, or "Unknown". */
export function typeLabelOf(file: FileItem): string {
  const dot = file.name.lastIndexOf(".");
  return dot > 0 && file.name.length - dot <= 9 ? file.name.slice(dot + 1).toUpperCase() : t("pv.type.unknown");
}
