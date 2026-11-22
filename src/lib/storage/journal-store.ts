import type { JournalEntry } from "@/lib/types";
import { closeSharedDb, sharedDb } from "./db";
import { isExpired, type JournalStore } from "./journal";

const db = sharedDb;

/** The `journal` store in IndexedDB. Entries hold keys of objects and counts, never credentials. */
export const journalStore: JournalStore & { prune(now?: Date): Promise<void> } = {
  async put(entry: JournalEntry): Promise<void> {
    await (await db()).put("journal", entry);
  },
  async get(id: string): Promise<JournalEntry | undefined> {
    return (await db()).get("journal", id);
  },
  async list(): Promise<JournalEntry[]> {
    return (await db()).getAll("journal");
  },
  async delete(id: string): Promise<void> {
    await (await db()).delete("journal", id);
  },
  /** Drop done and discarded entries older than the Undo window (technical-spec 8, rule 6). */
  async prune(now: Date = new Date()): Promise<void> {
    const handle = await db();
    for (const entry of await handle.getAll("journal")) if (isExpired(entry, now)) await handle.delete("journal", entry.id);
  },
};

export async function closeJournalStore(): Promise<void> {
  await closeSharedDb();
}
