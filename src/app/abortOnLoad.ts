import { addInterruptedUploads, useTransfers } from "@/features/transfers";
import type { ConnectionSummary } from "@/lib/types";

/**
 * Abort-on-load (C-43, FR-41 AC-41.5). A multipart upload that was running when
 * the page closed or reloaded is still open at the provider, costing storage.
 * Once a connection to the same endpoint and bucket exists, each stored record
 * is aborted with AbortMultipartUpload, removed, and shown as interrupted. If the
 * abort fails the record stays, so the next load tries again. Records for other
 * buckets stay until a connection to them exists. A record whose upload lock is
 * held is skipped: another tab is still running that upload. There is no resume in MVP.
 */
export async function abortInterruptedUploads(connection: ConnectionSummary): Promise<void> {
  const { uploadStore } = await import("@/lib/storage/uploads");
  const { heldUploadIds } = await import("@/lib/storage/locks");
  const active = new Set(useTransfers.getState().transfers.map((transfer) => transfer.id));
  // IndexedDB is shared by every tab: a record whose lock is held belongs to an upload that is still running somewhere (D-36).
  const held = await heldUploadIds();
  const matching = (await uploadStore.list()).filter(
    (record) =>
      record.endpoint === connection.endpoint && record.bucket === (connection.bucket ?? "") && !active.has(record.id) && !(held?.has(record.id) ?? false),
  );
  if (matching.length === 0) return;
  const { abortUpload, clientFor, nameOf } = await import("@/lib/s3");
  const client = clientFor(connection);
  const aborted: { id: string; name: string }[] = [];
  for (const record of matching) {
    try {
      await abortUpload(client, { bucket: record.bucket, key: record.key, uploadId: record.uploadId });
      await uploadStore.delete(record.id);
      aborted.push({ id: record.id, name: nameOf(record.key) });
    } catch {
      // Offline or not allowed right now: keep the record for the next load.
    }
  }
  if (aborted.length > 0) addInterruptedUploads(aborted);
}
