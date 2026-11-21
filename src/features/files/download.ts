import { t } from "@/lib/i18n";
import type { ConnectionSummary } from "@/lib/types";
import { getClient } from "./client";
import type { Item } from "./model";

const GAP_MS = 400;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Hand a presigned URL to the browser's download manager. The URL lives in this anchor for one click and is never logged or kept. */
function startDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noreferrer";
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Download files one after another straight from the provider (AC-37.1, AC-37.3).
 * No bytes pass through the app (AC-37.2). Folders are skipped; the zip is v1.
 */
export async function downloadItems(connection: ConnectionSummary, items: readonly Item[], notify: (message: string) => void): Promise<void> {
  const files = items.filter((item) => item.kind === "file");
  if (files.length === 0) return;
  if (files.length > 1) notify(t("files.download.multi"));
  try {
    const [{ presignDownload }, client] = await Promise.all([import("@/lib/s3"), getClient(connection)]);
    for (const [index, file] of files.entries()) {
      if (index > 0) await pause(GAP_MS);
      startDownload(await presignDownload(client, { bucket: connection.bucket ?? "", key: file.key, filename: file.name }));
    }
  } catch {
    notify(t("files.download.error"));
  }
}
