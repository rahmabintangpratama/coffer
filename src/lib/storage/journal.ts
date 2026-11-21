import type { JournalEntry, OperationKind } from "@/lib/types";

/** How long a finished entry is kept for Undo (technical-spec 8, rule 6). */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** What lib/storage keeps and lib/s3 reads and writes through (lib/storage never imports lib/s3). */
export interface JournalStore {
  put(entry: JournalEntry): Promise<void>;
  get(id: string): Promise<JournalEntry | undefined>;
  list(): Promise<JournalEntry[]>;
  delete(id: string): Promise<void>;
}

export interface NewEntry {
  id: string;
  kind: OperationKind;
  connectionId: string;
  endpoint: string;
  bucket: string;
  /** A key, or a prefix ending in "/". */
  source: string;
  target?: string;
  undoOf?: string;
}

const stamp = (now: Date) => now.toISOString();

/**
 * The write-ahead state machine (technical-spec 8). These are pure: each takes an
 * entry and returns the next one, so the rules are tested without storage, and the
 * engine persists every result before it acts on it.
 */

/** Rule 1: the entry is written, in `planning`, before the first request. */
export function startEntry(init: NewEntry, now: Date = new Date()): JournalEntry {
  return {
    id: init.id,
    kind: init.kind,
    connectionId: init.connectionId,
    endpoint: init.endpoint,
    bucket: init.bucket,
    source: init.source,
    ...(init.target === undefined ? {} : { target: init.target }),
    ...(init.undoOf === undefined ? {} : { undoOf: init.undoOf }),
    total: 0,
    done: 0,
    status: "running",
    phase: "planning",
    startedAt: stamp(now),
    updatedAt: stamp(now),
  };
}

/** Rule 1, after listing the source: the total is known and copying starts. */
export function planned(entry: JournalEntry, total: number, now: Date = new Date()): JournalEntry {
  return { ...entry, total, phase: "copying", updatedAt: stamp(now) };
}

/** Rule 3: `done` counts objects whose source is gone; `cursor` is the last source key before which everything is done. */
export function advance(entry: JournalEntry, progress: { done: number; cursor?: string | undefined }, now: Date = new Date()): JournalEntry {
  return {
    ...entry,
    done: progress.done,
    ...(progress.cursor === undefined ? {} : { cursor: progress.cursor }),
    updatedAt: stamp(now),
  };
}

/** Rule 6: finished with every object processed is `done`; with failures it stays resumable as `interrupted`. */
export function finish(entry: JournalEntry, failures: JournalEntry["failures"] = [], now: Date = new Date()): JournalEntry {
  const next: JournalEntry = { ...entry, updatedAt: stamp(now) };
  delete next.failures;
  return failures.length === 0
    ? { ...next, phase: "finished", status: "done" }
    : { ...next, phase: "copying", status: "interrupted", failures };
}

/** On load, an entry that was running and has no live lock was cut off. */
export function interrupt(entry: JournalEntry, now: Date = new Date()): JournalEntry {
  return entry.status === "running" ? { ...entry, status: "interrupted", updatedAt: stamp(now) } : entry;
}

/** Resume continues from the cursor with the failures cleared: they are tried again. */
export function resume(entry: JournalEntry, now: Date = new Date()): JournalEntry {
  if (entry.status !== "interrupted") return entry;
  const next: JournalEntry = { ...entry, status: "running", phase: entry.phase === "planning" ? "planning" : "copying", updatedAt: stamp(now) };
  delete next.failures;
  return next;
}

/** Discard closes the entry and deletes nothing; some objects are at the target and some remain at the source. */
export function discard(entry: JournalEntry, now: Date = new Date()): JournalEntry {
  return entry.status === "interrupted" || entry.status === "running" ? { ...entry, status: "discarded", updatedAt: stamp(now) } : entry;
}

/** Undo: a new entry with the source and target swapped and `undoOf` pointing at the one it reverses (move, rename, trash). */
export function reversed(entry: JournalEntry, id: string, now: Date = new Date()): JournalEntry | null {
  if (entry.target === undefined || entry.status !== "done") return null;
  if (entry.kind !== "move" && entry.kind !== "rename" && entry.kind !== "trash") return null;
  return startEntry({ id, kind: entry.kind === "trash" ? "restore" : entry.kind, connectionId: entry.connectionId, endpoint: entry.endpoint, bucket: entry.bucket, source: entry.target, target: entry.source, undoOf: entry.id }, now);
}

/** A finished or closed entry older than the Undo window is dropped; a running or interrupted one never is. */
export function isExpired(entry: JournalEntry, now: Date = new Date()): boolean {
  if (entry.status === "running" || entry.status === "interrupted" || entry.status === "paused") return false;
  return now.getTime() - new Date(entry.updatedAt).getTime() > UNDO_WINDOW_MS;
}

/** Whether Undo is offered: done, reversible, and inside the window. */
export function canUndo(entry: JournalEntry, now: Date = new Date()): boolean {
  return reversed(entry, "probe", now) !== null && !isExpired(entry, now);
}

/** The name shown for an entry: its last path segment. */
export function nameOfEntry(entry: JournalEntry): string {
  const trimmed = entry.source.endsWith("/") ? entry.source.slice(0, -1) : entry.source;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}
