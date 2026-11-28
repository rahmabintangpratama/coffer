import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_NAME, unsealDbForTests } from "./db";
import { storedReport } from "./forget";
import { finish, interrupt, isUnfinished, planned, reversed, startEntry } from "./journal";
import { closeJournalStore, journalStore } from "./journal-store";
import { withOperationLock } from "./locks";

// M11 QA: Settings said "6 interrupted moves" after six moves that all finished. The count must
// hold only operations that really stopped part-way (FR-45, AC-101.2).

/** Web Locks shared by every "tab" in the test: one lock manager per origin, like the browser. */
function sharedLocks() {
  const held = new Set<string>();
  return {
    held,
    request: vi.fn(async (name: string, task: () => Promise<unknown>) => {
      held.add(name);
      try {
        return await task();
      } finally {
        held.delete(name);
      }
    }),
    query: vi.fn(() => Promise.resolve({ held: [...held].map((name) => ({ name })), pending: [] })),
  };
}

const entry = (id: string) => startEntry({ id, kind: "move", connectionId: "c1", endpoint: "http://x", bucket: "b", source: `a/${id}.txt`, target: `z/${id}.txt` });

beforeEach(async () => {
  unsealDbForTests();
  await closeJournalStore();
  await deleteDB(DB_NAME);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("M11 journal lifecycle and the interrupted count", () => {
  it("start, then commit: the entry is done and not counted, and its Undo is done too", async () => {
    vi.stubGlobal("navigator", { locks: sharedLocks() });
    const started = entry("m1");
    const final = await withOperationLock(started.id, async () => {
      await journalStore.put(started);
      expect((await storedReport()).journal).toBe(0); // running under a live lock is not interrupted
      const done = finish(planned(started, 1));
      await journalStore.put(done);
      return done;
    });
    expect(final.status).toBe("done");
    const undo = reversed(final, "u1");
    expect(undo).not.toBeNull();
    if (undo) await journalStore.put(finish(planned(undo, 1)));
    expect((await journalStore.list()).map((stored) => stored.status)).toEqual(["done", "done"]);
    expect((await storedReport()).journal).toBe(0);
  });

  it("start, then the tab dies: a running entry with no lock is reported, and stays reported once marked interrupted", async () => {
    vi.stubGlobal("navigator", { locks: sharedLocks() });
    await journalStore.put(planned(entry("m2"), 3)); // written, then the page closed: no lock holds it
    expect((await storedReport()).journal).toBe(1);
    const stored = await journalStore.get("m2");
    if (stored) await journalStore.put(interrupt(stored));
    expect((await journalStore.get("m2"))?.status).toBe("interrupted");
    expect((await storedReport()).journal).toBe(1);
  });

  it("two tabs: an entry running under another tab's lock is not counted; after that tab ends without finishing, it is", async () => {
    const locks = sharedLocks();
    vi.stubGlobal("navigator", { locks });
    const running = entry("m3");
    let release: () => void = () => undefined;
    const otherTab = withOperationLock(running.id, async () => {
      await journalStore.put(running);
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await vi.waitFor(() => { expect(locks.held.size).toBe(1); });
    expect((await storedReport()).journal).toBe(0);
    release(); // the other tab closes with the entry still running
    await otherTab;
    expect((await storedReport()).journal).toBe(1);
  });

  it("isUnfinished: interrupted and paused count; done and discarded never; running counts only without a lock", () => {
    const base = entry("x");
    expect(isUnfinished({ ...base, status: "interrupted" }, new Set())).toBe(true);
    expect(isUnfinished({ ...base, status: "paused" }, new Set())).toBe(true);
    expect(isUnfinished({ ...base, status: "done" }, new Set())).toBe(false);
    expect(isUnfinished({ ...base, status: "discarded" }, new Set())).toBe(false);
    expect(isUnfinished(base, new Set(["x"]))).toBe(false);
    expect(isUnfinished(base, new Set())).toBe(true);
    // Without the Web Locks API a running entry cannot be told from a dead one; it is not called interrupted.
    expect(isUnfinished(base, null)).toBe(false);
  });
});
