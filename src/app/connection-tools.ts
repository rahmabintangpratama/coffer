import type { ConnectionTools } from "@/features/vault";
import { getPreset, resolveAddressing } from "@/lib/providers";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";

/**
 * Test and Rename on Settings → Connections (M11). Test runs the same six steps as onboarding
 * with the saved keys and a client that tries once, so a CORS block fails at once. Rename seals
 * the record again: the name is not part of the record's binding (D-49), so nothing else changes.
 */
export const connectionTools: Omit<ConnectionTools, "add"> = {
  async test(connection, onStep, signal) {
    const { createClient, runConnectionTest } = await import("@/lib/s3");
    const client = createClient({
      endpoint: connection.endpoint,
      region: connection.region,
      forcePathStyle: resolveAddressing(getPreset(connection.providerId), connection.endpoint, connection.bucket, connection.addressingStyle).forcePathStyle,
      credentials: () => vault.credentialsFor(connection.id),
      maxAttempts: 1,
    });
    try {
      return await runConnectionTest({ client, endpoint: connection.endpoint, ...(connection.bucket === undefined ? {} : { bucket: connection.bucket }), prefix: connection.prefix ?? "", signal, onStep });
    } finally {
      client.destroy();
    }
  },
  async rename(connection: ConnectionSummary, name: string): Promise<ConnectionSummary> {
    const next = { ...connection, name };
    await vault.save(next);
    return next;
  },
};
