import type { S3Handle } from "@/lib/s3";
import type { ConnectionSummary } from "@/lib/types";

/** The S3 chunk loads on first use, after connect. */
export async function getClient(connection: ConnectionSummary): Promise<S3Handle> {
  const { clientFor } = await import("@/lib/s3");
  return clientFor(connection);
}
