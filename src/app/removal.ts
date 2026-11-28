import { discardOperation, resumeOperation } from "@/features/operations";
import { cancelConnectionTransfers, countConnectionTransfers } from "@/features/transfers";
import type { AbortSummary } from "@/lib/s3";
import type { ConnectionRemoval, RemovalPlan } from "@/features/vault";
import type { ConnectionSummary } from "@/lib/types";
import { queryClient } from "./query";
import { useToasts } from "./toast";

/** How long Remove waits for a stopped transfer to give back its lease, which is after it aborted its upload at the provider. */
const SETTLE_MS = 5000;

const hooks = (connection: ConnectionSummary) => ({
  notify: (message: string, action?: { label: string; run: () => void }) => { useToasts.getState().push({ message, ...(action ? { actionLabel: action.label, onAction: action.run } : {}) }); },
  onChanged: () => { void queryClient.resetQueries({ queryKey: ["list", connection.id] }); },
});

async function inspect(connection: ConnectionSummary): Promise<RemovalPlan> {
  const [{ dataOf }, { journalStore }, { recoverEntries }] = await Promise.all([
    import("@/lib/storage/connection-data"),
    import("@/lib/storage/journal-store"),
    import("@/lib/storage/journal-recovery"),
  ]);
  // A running entry with no live lock was cut off: it is interrupted and can be resumed or discarded, as on load.
  const recovered = await recoverEntries(journalStore, (entry) => entry.connectionId === connection.id);
  const unfinished = recovered.filter(({ entry }) => entry.status === "running" || entry.status === "interrupted" || entry.status === "paused");
  const data = await dataOf(connection.id);
  return { unfinished, transfers: countConnectionTransfers(connection.id), uploads: data.uploads.length, starred: data.starred, recent: data.recent };
}

/**
 * Remove a connection (OQ-37, C-55). It only changes data in this browser; bucket data is never touched. In order: stop
 * the connection's running and queued transfers, abort its incomplete multipart uploads at the provider (best effort),
 * delete its journal, upload, Starred and Recent rows, then delete the saved profile. Other connections and the vault
 * passphrase are not touched. The caller has checked that no move or copy is unfinished.
 */
async function remove(connection: ConnectionSummary): Promise<AbortSummary> {
  const [{ vault }, { dataOf, purgeConnectionData }, { abortStoredUploads }] = await Promise.all([
    import("@/lib/storage/vault"),
    import("@/lib/storage/connection-data"),
    import("@/lib/s3"),
  ]);
  cancelConnectionTransfers(connection.id);
  vault.stopLeases({ includeWaiting: true, connectionId: connection.id });
  // A stopped transfer aborts its own upload and deletes its record before it lets go of the lease.
  await vault.leasesSettled(SETTLE_MS, connection.id);
  const { uploads } = await dataOf(connection.id);
  const summary = await abortStoredUploads(connection, uploads);
  await purgeConnectionData(connection.id);
  await vault.remove(connection.id);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[1] === connection.id });
  return summary;
}

export const connectionRemoval: ConnectionRemoval = {
  inspect,
  resume: (connection, entry) => { resumeOperation(connection, entry, hooks(connection)); },
  discard: discardOperation,
  remove,
};
