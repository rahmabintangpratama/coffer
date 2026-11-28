import { useTransfers } from "@/features/transfers";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, JournalEntry, OperationKind } from "@/lib/types";
import { canWrite } from "@/features/readonly";
import { useOperations } from "./state";

export interface RunHooks {
  /** A short message, with an optional action (Undo). */
  notify: (message: string, action?: { label: string; run: () => void }) => void;
  /** The folder's listing changed: reload it. */
  onChanged: () => void;
}

export interface StartInput {
  connection: ConnectionSummary;
  kind: Extract<OperationKind, "move" | "rename" | "copy" | "restore" | "trash">;
  source: string;
  target: string;
  undoOf?: string;
}

const nameOf = (key: string) => {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
};

const isStop = (error: unknown): boolean => typeof error === "object" && error !== null && ((error as { name?: unknown }).name === "AbortError" || (error as { code?: unknown }).code === "aborted");

/**
 * A read-only key changes nothing (FR-111): the screens do not offer these, and this is the one place that would stop a
 * call that got through anyway (a journal entry from an earlier session, a stale handler). It says why and returns true.
 */
export function refuseRead(connection: ConnectionSummary, hooks: Pick<RunHooks, "notify">): boolean {
  if (canWrite(connection)) return false;
  hooks.notify(t("ro.reason"));
  return true;
}

// Two operations on one bucket never overlap: they run one after another (technical-spec 8, Concurrency).
let queue: Promise<unknown> = Promise.resolve();

/** Run `job` after the jobs queued before it; a failure shows the error toast and does not stop the queue. */
export function enqueue(job: () => Promise<void>, hooks: RunHooks): Promise<void> {
  // A transfer stopped by "Stop transfers and lock" or Forget is not an error: the entry stays in the journal as interrupted.
  const next = queue.then(job).catch((error: unknown) => { if (!isStop(error)) hooks.notify(t("op.error")); });
  queue = next;
  return next;
}

/** Create each entry in turn, under its own lock, write-ahead, and run it. Stops at the first one that is cut off. */
async function runEntries(specs: readonly StartInput[], hooks: RunHooks): Promise<JournalEntry[]> {
  const [{ startEntry }, { journalStore }, { withOperationLock }] = await Promise.all([import("@/lib/storage/journal"), import("@/lib/storage/journal-store"), import("@/lib/storage/locks")]);
  const finals: JournalEntry[] = [];
  for (const input of specs) {
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
    const final = await withOperationLock(entry.id, async () => {
      await journalStore.put(entry);
      return execute(input.connection, entry);
    });
    finals.push(final);
    if (final.status !== "done") break;
    // AC-80.2: a star follows a move or rename through Coffer and goes with a trash. Stars are a convenience; a failure here never fails the operation.
    if ((final.kind === "move" || final.kind === "rename" || final.kind === "trash") && final.target !== undefined) {
      const target = final.kind === "trash" ? null : final.target;
      await import("@/lib/storage/library").then((library) => library.followStars(final.connectionId, final.bucket, final.source, target)).catch(() => undefined);
    }
  }
  hooks.onChanged();
  return finals;
}

/**
 * Write the journal entry and run it, in the background: the panel shows "Moving “name”"
 * with progress, the entry survives a closed tab, and the screen can go on being used.
 */
export function startOperation(input: StartInput, hooks: RunHooks): void {
  if (refuseRead(input.connection, hooks)) return;
  void enqueue(async () => {
    const [final] = await runEntries([input], hooks);
    if (final?.status === "done") await announce(input.connection, final, hooks);
  }, hooks);
}

/**
 * Move items to the trash (FR-36): one batch prefix for the whole action, one journal entry per
 * item, one toast "Moved N items to trash" with an Undo that restores them all (AC-36.1, AC-36.3).
 */
export function startTrash(input: { connection: ConnectionSummary; root: string; keys: readonly string[] }, hooks: RunHooks): void {
  if (refuseRead(input.connection, hooks)) return;
  void enqueue(async () => {
    const { newBatchId, trashKeyOf } = await import("@/lib/s3");
    const batch = newBatchId();
    const finals = await runEntries(input.keys.map((key) => ({ connection: input.connection, kind: "trash", source: key, target: trashKeyOf(input.root, batch, key) })), hooks);
    const done = finals.filter((entry) => entry.status === "done");
    if (done.length === 0) return;
    const { reversed } = await import("@/lib/storage/journal");
    const undo = done.flatMap((entry) => reversed(entry, crypto.randomUUID()) ?? []);
    hooks.notify(t("toast.trashed", { count: done.length }), {
      label: t("act.undo"),
      run: () => {
        void enqueue(async () => {
          const restored = await runEntries(undo.map((entry) => ({ connection: input.connection, kind: "restore", source: entry.source, target: entry.target ?? "", ...(entry.undoOf === undefined ? {} : { undoOf: entry.undoOf }) })), hooks);
          // Undo replaces the trash toast with what happened.
          const back = restored.filter((entry) => entry.status === "done").length;
          if (back > 0) hooks.notify(t("toast.restored", { count: back }));
        }, hooks);
      },
    });
  }, hooks);
}

/** Restore trashed objects, one entry each (or a whole batch as one prefix entry), then one toast (FR-70). */
export function startRestore(input: { connection: ConnectionSummary; moves: readonly { source: string; target: string }[] }, hooks: RunHooks): void {
  if (refuseRead(input.connection, hooks)) return;
  void enqueue(async () => {
    const finals = await runEntries(input.moves.map((move) => ({ connection: input.connection, kind: "restore", source: move.source, target: move.target })), hooks);
    const done = finals.filter((entry) => entry.status === "done");
    const first = done[0]?.target;
    if (done.length > 0) hooks.notify(t("toast.restored", { count: done.length }), first === undefined ? undefined : showLocationOf(input.connection, first));
  }, hooks);
}

/**
 * Resume an interrupted entry (technical-spec 8: re-list from the cursor, trust nothing in memory).
 * The lock is taken first and never waited for: if another tab holds it the operation is running
 * there, and this tab says so instead of starting it a second time (D-41).
 */
export function resumeOperation(connection: ConnectionSummary, entry: JournalEntry, hooks: RunHooks): void {
  if (refuseRead(connection, hooks)) return;
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
          const final = await execute(connection, resume(stored));
          hooks.onChanged();
          if (final.status === "done") await announce(connection, final, hooks);
        }, hooks),
      );
      if (!outcome.ran) hooks.notify(t("op.resumeElsewhere"));
    } catch {
      hooks.notify(t("op.error"));
    }
  })();
}

/** The folder a key sits in, as the toast names it: its last segment, or the bucket at the top. */
function folderOf(connection: ConnectionSummary, key: string): string {
  const root = connection.prefix ?? "";
  const relative = key.startsWith(root) ? key.slice(root.length) : key;
  const trimmed = relative.endsWith("/") ? relative.slice(0, -1) : relative;
  const parent = trimmed.slice(0, Math.max(0, trimmed.lastIndexOf("/")));
  return parent === "" ? (connection.bucket ?? "") : parent.slice(parent.lastIndexOf("/") + 1);
}

/** "Show location": open the folder a key sits in. The address is in the fragment, like every Files route. */
function showLocationOf(connection: ConnectionSummary, key: string): { label: string; run: () => void } {
  return {
    label: t("toast.showLocation"),
    run: () => {
      const root = connection.prefix ?? "";
      const relative = key.startsWith(root) ? key.slice(root.length) : key;
      const trimmed = relative.endsWith("/") ? relative.slice(0, -1) : relative;
      const parts = trimmed.split("/").slice(0, -1).filter((part) => part !== "");
      window.location.hash = parts.length === 0 ? "#/files" : `#/files/${parts.map(encodeURIComponent).join("/")}`;
    },
  };
}

const titleOf = (entry: JournalEntry, name: string) => (entry.kind === "trash" ? t("op.titleTrash", { name }) : entry.kind === "restore" ? t("op.titleRestore", { name }) : t("op.title", { name }));

/** Run one stored entry with the panel row; the caller holds the lock. Returns the final entry. */
async function execute(connection: ConnectionSummary, entry: JournalEntry): Promise<JournalEntry> {
  const [s3, { journalStore }] = await Promise.all([import("@/lib/s3"), import("@/lib/storage/journal-store")]);
  const transfers = useTransfers.getState();
  const name = nameOf(entry.source);
  const title = titleOf(entry, name);
  transfers.setOperation({ id: entry.id, name, title, done: entry.done, total: entry.total });
  let final: JournalEntry;
  try {
    // On a lease, so a lock lets it finish (C-27); it waits for the unlock when it was queued behind a running one.
    final = await s3.withLeasedClient(
      connection,
      (client, lease) =>
        s3.runOperation({
          client,
          journal: journalStore,
          entry,
          signal: lease.signal,
          onProgress: (progress) => { useTransfers.getState().setOperation({ id: progress.id, name, title, done: progress.done, total: progress.total }); },
        }),
      { wait: true },
    );
  } finally {
    useTransfers.getState().removeOperation(entry.id);
  }
  if (final.status === "interrupted") useOperations.getState().upsertInterrupted(final);
  return final;
}

/** The toast for a finished move, rename or copy, with Undo where there is one (technical-spec 8). */
async function announce(connection: ConnectionSummary, final: JournalEntry, hooks: RunHooks): Promise<void> {
  const { reversed } = await import("@/lib/storage/journal");
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
  if (final.kind === "trash") {
    hooks.notify(t("toast.trashed", { count: 1 }), final.undoOf === undefined ? undoAction : undefined);
    return;
  }
  if (final.kind === "restore") {
    hooks.notify(t("toast.restored", { count: 1 }), final.target === undefined ? undefined : showLocationOf(connection, final.target));
    return;
  }
  hooks.notify(
    final.kind === "rename"
      ? t("toast.renamed", { name: target })
      : final.kind === "copy"
        ? t("toast.copyMade", { name: target })
        : t("toast.movedTo", { count: 1, folder: folderOf(connection, final.target ?? final.source) }),
    // Undo for a move and a rename while the entry exists; a copy and an Undo itself have none (technical-spec 8).
    final.undoOf === undefined ? undoAction : undefined,
  );
}

/** On load: entries that were running with no live lock were cut off; the ones for this endpoint and bucket wait for the person. */
export async function loadInterrupted(connection: ConnectionSummary): Promise<void> {
  const [{ journalStore }, { recoverEntries }] = await Promise.all([import("@/lib/storage/journal-store"), import("@/lib/storage/journal-recovery")]);
  await journalStore.prune();
  const recovered = await recoverEntries(journalStore, (entry) => entry.endpoint === connection.endpoint && entry.bucket === (connection.bucket ?? ""));
  // A live entry is running in another tab (or this one) and is left to it.
  const found = recovered.map((item) => item.entry).filter((entry) => entry.status === "interrupted");
  useOperations.getState().setInterrupted(found);
}

/** Discard closes the entry and deletes nothing (AC-45.4). */
export async function discardOperation(entry: JournalEntry): Promise<void> {
  const [{ journalStore }, { discard }] = await Promise.all([import("@/lib/storage/journal-store"), import("@/lib/storage/journal")]);
  await journalStore.put(discard(entry));
  useOperations.getState().removeInterrupted(entry.id);
}
