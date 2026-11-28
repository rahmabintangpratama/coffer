import type { ConnectionTools } from "@/features/vault";
import { getPreset, resolveAddressing } from "@/lib/providers";
import { vault } from "@/lib/storage/vault";

/**
 * Test on Settings → Connections (M11): the same six steps as onboarding with the saved keys and
 * a client that tries once, so a CORS block fails at once.
 */
export const connectionTools: Omit<ConnectionTools, "add" | "edit"> = {
  providerName: (connection) => getPreset(connection.providerId).displayName,
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
};
