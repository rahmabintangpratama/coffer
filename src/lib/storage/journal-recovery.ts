import type { JournalEntry } from "@/lib/types";
import { interrupt, type JournalStore } from "./journal";
import { heldOperationIds, withOperationLock } from "./locks";

/**
 * Read the journal and mark every entry that was cut off: `running` with no live lock (D-41). The caller gets each
 * entry as it is stored afterwards, with `live` set for one that is running under a lock, here or in another tab.
 *
 * Order matters, because other tabs write the journal meanwhile. The entries are read first and the locks second: an
 * operation takes its lock before its first write, so an entry that was read as running and is alive shows its lock.
 * A free lock may also mean the operation finished in between, so the entry is read again, holding its lock, before
 * anything is written over it.
 */
export async function recoverEntries(store: JournalStore, wanted: (entry: JournalEntry) => boolean): Promise<{ entry: JournalEntry; live: boolean }[]> {
  const entries = (await store.list()).filter(wanted);
  const held = await heldOperationIds();
  const recovered: { entry: JournalEntry; live: boolean }[] = [];
  for (const stored of entries) {
    if (stored.status !== "running") {
      recovered.push({ entry: stored, live: false });
      continue;
    }
    // Without the Web Locks API a running entry cannot be told from a dead one; it counts as cut off.
    if (held?.has(stored.id) ?? false) {
      recovered.push({ entry: stored, live: true });
      continue;
    }
    const settled = await withOperationLock(stored.id, async () => {
      const fresh = await store.get(stored.id);
      if (fresh?.status !== "running") return fresh;
      const cut = interrupt(fresh);
      await store.put(cut);
      return cut;
    });
    if (settled) recovered.push({ entry: settled, live: false });
  }
  return recovered;
}
