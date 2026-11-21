import { getPreset, resolveAddressing } from "@/lib/providers";
import type { S3Handle } from "@/lib/s3";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";

// One client per connection (technical-spec 6.1). The S3 chunk loads on first use, after connect.
const clients = new Map<string, Promise<S3Handle>>();

export function getClient(connection: ConnectionSummary): Promise<S3Handle> {
  const existing = clients.get(connection.id);
  if (existing) return existing;
  const created = import("@/lib/s3").then(({ createClient }) =>
    createClient({
      endpoint: connection.endpoint,
      region: connection.region,
      forcePathStyle: resolveAddressing(getPreset(connection.providerId), connection.endpoint, connection.bucket, connection.addressingStyle)
        .forcePathStyle,
      credentials: () => vault.credentialsFor(connection.id),
    }),
  );
  clients.set(connection.id, created);
  return created;
}

// A lock drops the keys, so a client that outlives them is destroyed with them.
vault.onLock(() => {
  for (const client of clients.values()) void client.then((handle) => { handle.destroy(); });
  clients.clear();
});
