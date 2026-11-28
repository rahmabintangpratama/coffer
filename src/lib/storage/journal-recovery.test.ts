import { afterEach, describe, expect, it, vi } from "vitest";
import type { JournalEntry } from "@/lib/types";
import { finish, type JournalStore, planned, startEntry } from "./journal";
import { recoverEntries } from "./journal-recovery";
import { OPERATION_LOCK_PREFIX } from "./locks";

// D-41, AC-45.2: recovery must not write over an operation another tab is running or has just finished. The other
// tab's steps are injected at exact points, so each interleaving happens every time.
const entry = (id: string) => planned(startEntry({ id, kind: "move", connectionId: "c1", endpoint: "http://x", bucket: "b", source: `a/${id}`, target: `z/${id}` }), 2);

function memoryStore(initial: JournalEntry[] = []) {
  const rows = new Map(initial.map((row) => [row.id, row]));
  const store: JournalStore = {
    put: (row) => { rows.set(row.id, row); return Promise.resolve(); },
    get: (id) => Promise.resolve(rows.get(id)),
    list: () => Promise.resolve([...rows.values()]),
    delete: (id) => { rows.delete(id); return Promise.resolve(); },
  };
  return { store, rows };
}

/** Web Locks for every "tab". `beforeQuery` runs just before the lock state is read. */
function locks(held = new Set<string>(), beforeQuery: () => Promise<void> = () => Promise.resolve()) {
  vi.stubGlobal("navigator", {
    locks: {
      request: async (_name: string, task: () => Promise<unknown>) => task(),
      query: async () => {
        await beforeQuery();
        return { held: [...held].map((id) => ({ name: `${OPERATION_LOCK_PREFIX}${id}` })), pending: [] };
      },
    },
  });
  return held;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("D-41 recovering the journal", () => {
  it("marks a running entry with no lock as interrupted, and leaves a locked one running", async () => {
    const { store, rows } = memoryStore([entry("dead"), entry("alive")]);
    locks(new Set(["alive"]));
    const found = await recoverEntries(store, () => true);
    expect(found.map((item) => [item.entry.id, item.entry.status, item.live])).toEqual([["dead", "interrupted", false], ["alive", "running", true]]);
    expect(rows.get("alive")?.status).toBe("running");
  });

  it("an operation that starts in another tab while the journal is being recovered is not marked", async () => {
    const { store, rows } = memoryStore();
    const held = new Set<string>();
    // The other tab: lock first, then the write, both between this tab's two reads.
    locks(held, async () => { held.add("new"); await store.put(entry("new")); });
    await recoverEntries(store, () => true);
    expect(rows.get("new")?.status).toBe("running");
  });

  it("an operation that finishes between the read and the lock check stays done", async () => {
    const running = entry("m1");
    const { store, rows } = memoryStore([running]);
    // The other tab writes `done` and releases its lock before this tab reads the locks.
    locks(new Set(), async () => { await store.put(finish(running)); });
    const found = await recoverEntries(store, () => true);
    expect(rows.get("m1")?.status).toBe("done");
    expect(found.map((item) => item.entry.status)).toEqual(["done"]);
  });

  it("reads only the wanted entries", async () => {
    const { store, rows } = memoryStore([entry("mine"), { ...entry("other"), bucket: "elsewhere" }]);
    locks();
    await recoverEntries(store, (row) => row.bucket === "b");
    expect(rows.get("other")?.status).toBe("running");
  });
});
