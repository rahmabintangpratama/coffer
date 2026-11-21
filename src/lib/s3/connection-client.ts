import { getPreset, resolveAddressing } from "@/lib/providers";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { createClient } from "./client";
import type { S3Client } from "@aws-sdk/client-s3";

// One client per connection (technical-spec 6.1), built on first use after connect.
const clients = new Map<string, S3Client>();

/** The client for a connection. Its credentials are read from the vault per request, so a lock stops it. */
export function clientFor(connection: ConnectionSummary): S3Client {
  const existing = clients.get(connection.id);
  if (existing) return existing;
  const created = createClient({
    endpoint: connection.endpoint,
    region: connection.region,
    forcePathStyle: resolveAddressing(getPreset(connection.providerId), connection.endpoint, connection.bucket, connection.addressingStyle).forcePathStyle,
    credentials: () => vault.credentialsFor(connection.id),
  });
  clients.set(connection.id, created);
  return created;
}

// A lock drops the keys, so a client that outlives them is destroyed with them.
vault.onLock(() => {
  for (const client of clients.values()) client.destroy();
  clients.clear();
});
