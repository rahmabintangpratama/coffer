import { useTransfers } from "@/features/transfers";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, JournalEntry, OperationKind } from "@/lib/types";
import { useOperations } from "./state";

export interface RunHooks {
  /** A short message, with an optional action (Undo). */
  notify: (message: string, action?: { label: string; run: () => void }) => void;
  /** The folder's listing changed: reload it. */
  onChanged: () => void;
}

export interface StartInput {
  connection: ConnectionSummary;
  kind: Extract<OperationKind, "move" | "rename" | "copy" | "restore">;
  source: string;
  target: string;
  undoOf?: string;
}

const nameOf = (key: string) => {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
};

// Two operations on one bucket never overlap: they run one after another (technical-spec 8, Concurrency).
let queue: Promise<unknown> = Promise.resolve();

/** Run `job` after the jobs queued before it; a failure shows the error toast and does not stop the queue. */
function enqueue(job: () => Promise<void>, hooks: RunHooks): Promise<void> {
  const next = queue.then(job).catch(() => { hooks.notify(t("op.error")); });
  queue = next;
  return next;
}

/**
 * Write the journal entry and run it, in the background: the panel shows "Moving “name”"
 * with progress, the entry survives a closed tab, and the screen can go on being used.
 */
export function startOperation(input: StartInput, hooks: RunHooks): void {
  void enqueue(async () => {
    const [{ startEntry }, { journalStore }, { withOperationLock }] = await Promise.all([import("@/lib/storage/journal"), import("@/lib/storage/journal-store"), import("@/lib/storage/locks")]);
    const entry = startEntry({
      id: crypto.randomUUID(),
      kind: input.kind,
      connectionId: input.connection.id,
      endpoint: input.connection.endpoint,
      bucket: input.connection.bucket ?? "",
      source: input.source,
      target: input.target,
      ...(input.undoOf === undefined ? {} : { undoOf: input.undoOf }),
    });
    // The lock comes before the first write: an entry that says `running` always has a live lock (D-41).
    await withOperationLock(entry.id, async () => {
      await journalStore.put(entry);
      await execute(input.connection, entry, hooks);
    });
  }, hooks);
}

/**
 * Resume an interrupted entry (technical-spec 8: re-list from the cursor, trust nothing in memory).
 * The lock is taken first and never waited for: if another tab holds it the operation is running
 * there, and this tab says so instead of starting it a second time (D-41).
 */
export function resumeOperation(connection: ConnectionSummary, entry: JournalEntry, hooks: RunHooks): void {
  useOperations.getState().removeInterrupted(entry.id);
  void (async () => {
    try {
      const [{ journalStore }, { resume }, { tryOperationLock }] = await Promise.all([import("@/lib/storage/journal-store"), import("@/lib/storage/journal"), import("@/lib/storage/locks")]);
      const outcome = await tryOperationLock(entry.id, () =>
        enqueue(async () => {
          // The banner's copy may be old: another tab may have finished or discarded the entry since.
          const stored = await journalStore.get(entry.id);
          if (stored?.status !== "interrupted") {
            hooks.notify(t("op.resumeSettled"));
            return;
          }
          await execute(connection, resume(stored), hooks);
        }, hooks),
      );
      if (!outcome.ran) hooks.notify(t("op.resumeElsewhere"));
    } catch {
      hooks.notify(t("op.error"));
    }
  })();
}

async function execute(connection: ConnectionSummary, entry: JournalEntry, hooks: RunHooks): Promise<void> {
  const [s3, { journalStore }, { reversed }] = await Promise.all([import("@/lib/s3"), import("@/lib/storage/journal-store"), import("@/lib/storage/journal")]);
  const transfers = useTransfers.getState();
  const name = nameOf(entry.source);
  transfers.setOperation({ id: entry.id, name, done: entry.done, total: entry.total });
  let final: JournalEntry;
  try {
    // The caller holds the entry's lock for the whole run, so another tab's load leaves it alone (D-41).
    final = await s3.runOperation({
      client: s3.clientFor(connection),
      journal: journalStore,
      entry,
      onProgress: (progress) => { useTransfers.getState().setOperation({ id: progress.id, name, done: progress.done, total: progress.total }); },
    });
  } finally {
    useTransfers.getState().removeOperation(entry.id);
  }
  hooks.onChanged();
  if (final.status === "interrupted") {
    useOperations.getState().upsertInterrupted(final);
    return;
  }
  const undo = reversed(final, crypto.randomUUID());
  const undoAction = undo
    ? {
        label: t("act.undo"),
        run: () => {
          startOperation({ connection, kind: undo.kind as StartInput["kind"], source: undo.source, target: undo.target ?? undo.source, undoOf: final.id }, hooks);
        },
      }
    : undefined;
  const target = nameOf(final.target ?? final.source);
  hooks.notify(
    final.kind === "rename" ? t("toast.renamed", { name: target }) : final.kind === "copy" ? t("toast.copyMade", { name: target }) : t("toast.moved", { name: target }),
    // Undo for a move and a rename while the entry exists; a copy and an Undo itself have none (technical-spec 8).
    final.undoOf === undefined ? undoAction : undefined,
  );
}

/** On load: entries that were running with no live lock were cut off; the ones for this endpoint and bucket wait for the person. */
export async function loadInterrupted(connection: ConnectionSummary): Promise<void> {
  const [{ journalStore }, { interrupt }, { heldOperationIds }] = await Promise.all([import("@/lib/storage/journal-store"), import("@/lib/storage/journal"), import("@/lib/storage/locks")]);
  await journalStore.prune();
  const held = await heldOperationIds();
  const found: JournalEntry[] = [];
  for (const stored of await journalStore.list()) {
    if (stored.endpoint !== connection.endpoint || stored.bucket !== (connection.bucket ?? "")) continue;
    // A running entry whose lock is held is alive in another tab (or this one); without the Web Locks API it cannot be told.
    const alive = stored.status === "running" && (held?.has(stored.id) ?? false);
    if (alive) continue;
    const entry = stored.status === "running" ? interrupt(stored) : stored;
    if (entry !== stored) await journalStore.put(entry);
    if (entry.status === "interrupted") found.push(entry);
  }
  useOperations.getState().setInterrupted(found);
}

/** Discard closes the entry and deletes nothing (AC-45.4). */
export async function discardOperation(entry: JournalEntry): Promise<void> {
  const [{ journalStore }, { discard }] = await Promise.all([import("@/lib/storage/journal-store"), import("@/lib/storage/journal")]);
  await journalStore.put(discard(entry));
  useOperations.getState().removeInterrupted(entry.id);
}
