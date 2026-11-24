import type { S3Client } from "@aws-sdk/client-s3";
import type { ConnectionSummary } from "@/lib/types";
import { withLeasedClient } from "./connection-client";
import { abortUpload } from "./upload";

export interface AbortSummary {
  aborted: number;
  failed: number;
}

interface Target {
  bucket: string;
  key: string;
  uploadId: string;
}

/** Abort each upload on its own, so one the provider refuses does not stop the rest. An upload that is already gone counts as aborted. */
export async function abortRecorded(client: S3Client, records: readonly Target[]): Promise<AbortSummary> {
  const summary: AbortSummary = { aborted: 0, failed: 0 };
  for (const record of records) {
    try {
      await abortUpload(client, record);
      summary.aborted += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

/**
 * Abort stored multipart uploads at the provider, best effort (OQ-37, C-55). Without keys for the connection (it is locked) none can be tried, and all
 * count as failed.
 */
export async function abortStoredUploads(connection: ConnectionSummary, records: readonly Target[]): Promise<AbortSummary> {
  if (records.length === 0) return { aborted: 0, failed: 0 };
  try {
    return await withLeasedClient(connection, (client) => abortRecorded(client, records));
  } catch {
    return { aborted: 0, failed: records.length };
  }
}
