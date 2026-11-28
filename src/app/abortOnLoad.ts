import { addInterruptedUploads, useTransfers } from "@/features/transfers";
import { heldUploadIds } from "@/lib/storage/locks";
import type { ConnectionSummary } from "@/lib/types";

/** A few short rounds, not a loop that never ends: this is for a lock that is still being released, or an abort the provider refused once. */
const ROUNDS = 4;
const GAP_MS = 1500;

export interface AbortOptions {
  /** Replaced by tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Abort-on-load (C-43, FR-41 AC-41.5). A multipart upload that was running when
 * the page closed or reloaded is still open at the provider, costing storage.
 * Once a connection to the same endpoint and bucket exists, each stored record
 * is aborted with AbortMultipartUpload, removed, and shown as interrupted.
 *
 * A record whose upload lock is held is not touched: another tab is still running
 * it (D-36). A lock can also outlive the page that held it for a moment (a reload),
 * and a provider can refuse an abort while its last part is still arriving, so the
 * records left over are tried again for a few rounds. What is still locked after
 * that really is alive in another tab; what still fails keeps its record for the
 * next load. Each round re-reads the store: a record that its own tab finished
 * and deleted in the meantime is never reported as interrupted. No resume in MVP.
 */
export async function abortInterruptedUploads(connection: ConnectionSummary, options: AbortOptions = {}): Promise<void> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const { uploadStore } = await import("@/lib/storage/uploads");
  const bucket = connection.bucket ?? "";

  const candidates = async () => {
    const active = new Set(useTransfers.getState().transfers.map((transfer) => transfer.id));
    return (await uploadStore.list()).filter((record) => record.endpoint === connection.endpoint && record.bucket === bucket && !active.has(record.id));
  };

  let pending = await candidates();
  if (pending.length === 0) return;
  const { abortUpload, clientFor, nameOf } = await import("@/lib/s3");
  const client = clientFor(connection);
  const aborted: { id: string; name: string }[] = [];

  for (let round = 0; round < ROUNDS && pending.length > 0; round += 1) {
    if (round > 0) {
      await sleep(GAP_MS);
      const stillStored = new Set((await candidates()).map((record) => record.id));
      pending = pending.filter((record) => stillStored.has(record.id));
    }
    const held = await heldUploadIds();
    const next: typeof pending = [];
    for (const record of pending) {
      if (held?.has(record.id) ?? false) {
        next.push(record);
        continue;
      }
      try {
        await abortUpload(client, { bucket: record.bucket, key: record.key, uploadId: record.uploadId });
        await uploadStore.delete(record.id);
        aborted.push({ id: record.id, name: nameOf(record.key) });
      } catch {
        next.push(record);
      }
    }
    pending = next;
  }
  if (aborted.length > 0) addInterruptedUploads(aborted);
}
