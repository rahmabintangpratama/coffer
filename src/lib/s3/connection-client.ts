import { getPreset, resolveAddressing } from "@/lib/providers";
import { type Lease, vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { createClient } from "./client";
import type { S3Client } from "@aws-sdk/client-s3";

// One client per connection (technical-spec 6.1), built on first use after connect.
const clients = new Map<string, S3Client>();

/** The client for a connection. Its credentials are read from the vault per request, so a lock stops it. */
export function clientFor(connection: ConnectionSummary): S3Client {
  const existing = clients.get(connection.id);
  if (existing) return existing;
  const created = createClient({ ...settingsOf(connection), credentials: () => vault.credentialsFor(connection.id) });
  clients.set(connection.id, created);
  return created;
}

const settingsOf = (connection: ConnectionSummary) => ({
  endpoint: connection.endpoint,
  region: connection.region,
  forcePathStyle: resolveAddressing(getPreset(connection.providerId), connection.endpoint, connection.bucket, connection.addressingStyle).forcePathStyle,
});

/**
 * Run a transfer on a credential lease (C-27, technical-spec 9): a private copy of the keys and a dedicated client, both
 * dropped when the task ends. A lock leaves them alone, so the transfer finishes; "Stop transfers and lock" and Forget
 * abort `lease.signal`. With `wait`, a transfer that starts while locked waits for the unlock instead of failing.
 */
export async function withLeasedClient<T>(
  connection: ConnectionSummary,
  task: (client: S3Client, lease: Lease) => Promise<T>,
  options: { wait?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const lease = options.wait === true ? await vault.leaseWhenUnlocked(connection.id, options.signal) : vault.lease(connection.id);
  const client = createClient({ ...settingsOf(connection), credentials: lease.credentials });
  try {
    return await task(client, lease);
  } finally {
    client.destroy();
    lease.release();
  }
}

// A lock drops the keys, so a client that outlives them is destroyed with them.
vault.onLock(() => {
  for (const client of clients.values()) client.destroy();
  clients.clear();
});
