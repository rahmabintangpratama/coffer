import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { DB_NAME } from "./db";
import { advance, canUndo, discard, finish, interrupt, isExpired, nameOfEntry, planned, resume, reversed, startEntry, UNDO_WINDOW_MS } from "./journal";
import { closeJournalStore, journalStore } from "./journal-store";

const t0 = new Date("2026-01-01T00:00:00.000Z");
const base = () => startEntry({ id: "op1", kind: "move", connectionId: "c1", endpoint: "http://x", bucket: "b", source: "a/dir/", target: "z/dir/" }, t0);

describe("AC-45.1 write-ahead state machine (technical-spec 8)", () => {
  it("starts running in planning with nothing counted, before any request", () => {
    expect(base()).toMatchObject({ status: "running", phase: "planning", total: 0, done: 0, source: "a/dir/", target: "z/dir/" });
  });

  it("planning ends with the total and copying", () => {
    expect(planned(base(), 2000)).toMatchObject({ phase: "copying", total: 2000, status: "running" });
  });

  it("advance records done and the cursor, and keeps the cursor when none is given", () => {
    const a = advance(planned(base(), 10), { done: 3, cursor: "a/dir/c" });
    expect(a).toMatchObject({ done: 3, cursor: "a/dir/c" });
    expect(advance(a, { done: 4 })).toMatchObject({ done: 4, cursor: "a/dir/c" });
  });

  it("finishing with every object processed is done", () => {
    expect(finish(planned(base(), 1))).toMatchObject({ phase: "finished", status: "done" });
  });

  it("finishing with failures stays resumable and names them", () => {
    const f = finish(planned(base(), 2), [{ key: "a/dir/x", code: "accessDenied" }]);
    expect(f).toMatchObject({ status: "interrupted", phase: "copying", failures: [{ key: "a/dir/x", code: "accessDenied" }] });
  });
});

describe("AC-45.2 to AC-45.4 interrupted, resume, discard", () => {
  it("only a running entry becomes interrupted", () => {
    expect(interrupt(base()).status).toBe("interrupted");
    const done = finish(base());
    expect(interrupt(done).status).toBe("done");
  });

  it("resume continues from the cursor and clears the failures so they are retried", () => {
    const stuck = finish(advance(planned(base(), 5), { done: 2, cursor: "a/dir/b" }), [{ key: "a/dir/d", code: "network" }]);
    const resumed = resume(stuck);
    expect(resumed).toMatchObject({ status: "running", phase: "copying", cursor: "a/dir/b", done: 2 });
    expect(resumed.failures).toBeUndefined();
  });

  it("resume leaves an entry that is not interrupted alone", () => {
    expect(resume(base())).toEqual(base());
  });

  it("discard closes the entry and changes no counts", () => {
    const d = discard(interrupt(advance(planned(base(), 5), { done: 2, cursor: "k" })));
    expect(d).toMatchObject({ status: "discarded", done: 2, total: 5, cursor: "k" });
  });

  it("discard does not touch a finished entry", () => {
    expect(discard(finish(base())).status).toBe("done");
  });
});

describe("AC-32.5 Undo", () => {
  it("reverses a finished move with source and target swapped and undoOf set", () => {
    const undo = reversed(finish(base()), "op2", t0);
    expect(undo).toMatchObject({ id: "op2", kind: "move", source: "z/dir/", target: "a/dir/", undoOf: "op1", status: "running", phase: "planning" });
  });

  it("a trash entry is reversed as a restore", () => {
    const trash = finish(startEntry({ id: "t", kind: "trash", connectionId: "c", endpoint: "http://x", bucket: "b", source: "k", target: ".trash/x/k" }, t0));
    expect(reversed(trash, "r")?.kind).toBe("restore");
  });

  it("copy and delete forever have no Undo, nor does an entry that has not finished", () => {
    const copy = finish(startEntry({ id: "c", kind: "copy", connectionId: "c", endpoint: "http://x", bucket: "b", source: "a", target: "b" }, t0));
    expect(reversed(copy, "x")).toBeNull();
    expect(reversed(base(), "x")).toBeNull();
    expect(reversed(finish(startEntry({ id: "d", kind: "deleteForever", connectionId: "c", endpoint: "http://x", bucket: "b", source: "a" }, t0)), "x")).toBeNull();
  });

  it("Undo is offered inside 24 hours and not after", () => {
    const done = finish(base(), [], t0);
    expect(canUndo(done, new Date(t0.getTime() + UNDO_WINDOW_MS - 1))).toBe(true);
    expect(canUndo(done, new Date(t0.getTime() + UNDO_WINDOW_MS + 1))).toBe(false);
  });
});

describe("pruning", () => {
  it("expires done and discarded entries after 24 hours, never running or interrupted ones", () => {
    const later = new Date(t0.getTime() + UNDO_WINDOW_MS + 1000);
    expect(isExpired(finish(base(), [], t0), later)).toBe(true);
    expect(isExpired(discard(interrupt(base(), t0), t0), later)).toBe(true);
    expect(isExpired(base(), later)).toBe(false);
    expect(isExpired(interrupt(base(), t0), later)).toBe(false);
  });

  it("names an entry by the last segment of its source", () => {
    expect(nameOfEntry(base())).toBe("dir");
    expect(nameOfEntry(startEntry({ id: "x", kind: "rename", connectionId: "c", endpoint: "http://x", bucket: "b", source: "a/b/file.txt", target: "a/b/new.txt" }))).toBe("file.txt");
  });
});

describe("the journal store", () => {
  beforeEach(async () => {
    await closeJournalStore();
    await deleteDB(DB_NAME);
  });

  it("stores, reads, lists and deletes entries", async () => {
    await journalStore.put(base());
    expect(await journalStore.get("op1")).toEqual(base());
    expect(await journalStore.list()).toHaveLength(1);
    await journalStore.delete("op1");
    expect(await journalStore.list()).toEqual([]);
  });

  it("prunes only entries past the Undo window", async () => {
    await journalStore.put(finish(base(), [], t0));
    await journalStore.put(interrupt(startEntry({ id: "keep", kind: "move", connectionId: "c", endpoint: "http://x", bucket: "b", source: "a", target: "b" }, t0), t0));
    await journalStore.prune(new Date(t0.getTime() + UNDO_WINDOW_MS + 1000));
    expect((await journalStore.list()).map((entry) => entry.id)).toEqual(["keep"]);
  });

  it("holds no credentials", async () => {
    await journalStore.put(base());
    expect(JSON.stringify(await journalStore.list())).not.toMatch(/secret|accessKey|credential/i);
  });
});
