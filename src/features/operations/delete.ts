import { useTransfers } from "@/features/transfers";
import { t } from "@/lib/i18n";
import type { DeleteFailure } from "@/lib/s3";
import type { ConnectionSummary } from "@/lib/types";
import { enqueue, refuseRead, type RunHooks } from "./run";

export interface DeleteHooks extends RunHooks {
  /** The keys that could not be deleted, after the rest went on (AC-71.3). */
  onFailures: (failures: DeleteFailure[]) => void;
}

/**
 * Delete forever (FR-71): the given keys, or everything under a prefix for Empty trash. DeleteObjects in
 * batches of up to 1,000 with progress in the panel; failures are listed and the rest continue. It is not
 * journaled: a delete is safe to repeat and what is left stays in the Trash view, so there is nothing to
 * resume or undo (technical-spec 8).
 */
export function startDelete(input: { connection: ConnectionSummary; total: number; keys?: readonly string[]; prefix?: string; owns?: (key: string) => boolean }, hooks: DeleteHooks): void {
  if (refuseRead(input.connection, hooks)) return;
  void enqueue(async () => {
    const s3 = await import("@/lib/s3");
    const bucket = input.connection.bucket ?? "";
    const id = crypto.randomUUID();
    const title = t("op.titleDelete", { count: input.total });
    const show = (done: number) => { useTransfers.getState().setOperation({ id, name: title, title, done, total: input.total }); };
    show(0);
    try {
      // On a lease like every running transfer (C-27): a lock lets it finish, "Stop transfers and lock" aborts it.
      const result = await s3.withLeasedClient(
        input.connection,
        (client, lease) => {
          const options = { bucket, onProgress: show, signal: lease.signal };
          return input.keys !== undefined ? s3.deleteKeys(client, input.keys, options) : s3.deleteUnder(client, input.prefix ?? "", { ...options, owns: input.owns });
        },
        { wait: true },
      );
      hooks.onChanged();
      if (result.deleted > 0) hooks.notify(t("toast.deleted", { count: result.deleted }));
      if (result.failed.length > 0) {
        hooks.onFailures(result.failed);
        hooks.notify(t("toast.deleteFailed", { count: result.failed.length }));
      }
    } finally {
      useTransfers.getState().removeOperation(id);
    }
  }, hooks);
}
