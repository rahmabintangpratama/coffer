// @vitest-environment node
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionStore } from "@/lib/storage/connection-store";
import { closeSharedDb, DB_NAME } from "@/lib/storage/db";
import { addStars, listStarred } from "@/lib/storage/library";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { editActions } from "./edit-connection";

// FR-11, AC-11.6, OQ-38: saving an edited connection, and every way it can fail, against fake IndexedDB and real Web Crypto.
const removal = vi.hoisted(() => ({ inspect: vi.fn(), remove: vi.fn() }));
vi.mock("./removal", () => ({ connectionRemoval: removal }));

const PASS = "correct horse battery staple";
const oldKeys = { accessKeyId: "old-example-access-id", secretAccessKey: "old-example-secret-not-real" };
const newKeys = { accessKeyId: "new-example-access-id", secretAccessKey: "new-example-secret-not-real" };
const before: ConnectionSummary = {
  id: "old", name: "Docs", providerId: "custom", fields: {}, endpoint: "http://127.0.0.1:9000", region: "us-east-1",
  addressingStyle: "path", bucket: "docs", access: "readWrite", createdAt: "2026-11-22T00:00:00.000Z",
};
/** The edited summary: it carries the temporary id its tested keys are held under. */
const edited = (change: Partial<ConnectionSummary> = {}): ConnectionSummary => ({ ...before, id: "tested", ...change });
const plan = (unfinished: unknown[] = []) => ({ unfinished, transfers: 1, uploads: 2, starred: 3, recent: 4 });
const stored = () => connectionStore.list();

beforeEach(async () => {
  const items = new Map<string, string>();
  (globalThis as { window?: unknown }).window = { localStorage: { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } } };
  await closeSharedDb();
  await deleteDB(DB_NAME);
  removal.inspect.mockReset().mockResolvedValue(plan());
  removal.remove.mockReset().mockImplementation(async (connection: ConnectionSummary) => { await vault.remove(connection.id); return { aborted: 0, failed: 0 }; });
  vault.put(before.id, oldKeys);
  await vault.save(before, PASS);
  vault.put("tested", newKeys);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vault.lock();
  await closeSharedDb();
  delete (globalThis as { window?: unknown }).window;
});

/** What a fresh session reads: lock, unlock, and the keys of one record. */
async function keysAfterUnlock(id: string) {
  vault.lock();
  await vault.unlock(PASS);
  return vault.credentialsFor(id);
}

describe("AC-11.6 the same destination", () => {
  it("writes the record again under its id with the new name and keys", async () => {
    const actions = editActions(before);
    await expect(actions.plan(edited({ name: "Team docs" }))).resolves.toEqual({ kind: "same" });
    await expect(actions.save(edited({ name: "Team docs" }))).resolves.toMatchObject({ connection: { id: "old", name: "Team docs" }, oldRemoved: true });
    expect((await stored()).map((profile) => [profile.id, profile.name])).toEqual([["old", "Team docs"]]);
    expect(vault.has("tested")).toBe(false);
    expect(removal.remove).not.toHaveBeenCalled();
    await expect(keysAfterUnlock("old")).resolves.toEqual(newKeys);
  });

  it("a write that fails leaves the record and the open keys as they were", async () => {
    const record = await stored();
    vi.spyOn(connectionStore, "put").mockRejectedValueOnce(new Error("quota"));
    await expect(editActions(before).save(edited({ name: "Team docs" }))).rejects.toThrow("quota");
    await expect(stored()).resolves.toEqual(record);
    await expect(vault.credentialsFor("old")).resolves.toEqual(oldKeys);
    await expect(keysAfterUnlock("old")).resolves.toEqual(oldKeys);
  });

  it("a lock during the save writes nothing", async () => {
    const record = await stored();
    const saving = editActions(before).save(edited({ name: "Team docs" }));
    vault.lock();
    await expect(saving).rejects.toMatchObject({ name: "LockedError" });
    await expect(stored()).resolves.toEqual(record);
  });
});

describe("AC-11.6 a changed destination", () => {
  const moved = edited({ bucket: "archive" });

  it("plans a replacement with what the old connection loses", async () => {
    await expect(editActions(before).plan(moved)).resolves.toEqual({ kind: "replace", transfers: 1, uploads: 2, starred: 3, recent: 4, kept: 0 });
  });

  it("keeps Starred for the same server and bucket under the new start folder, and counts the rest as removed", async () => {
    await addStars(["team/a.txt", "other/b.txt"].map((key) => ({ connectionId: "old", bucket: "docs", key, kind: "file" as const })));
    removal.inspect.mockResolvedValue({ unfinished: [], transfers: 0, uploads: 0, starred: 2, recent: 0 });
    const actions = editActions(before);
    await expect(actions.plan(edited({ prefix: "team/" }))).resolves.toMatchObject({ starred: 1, kept: 1 });
    await actions.save(edited({ prefix: "team/" }));
    expect((await listStarred("tested", "docs")).map((item) => item.key)).toEqual(["team/a.txt"]);
  });

  it("carries nothing to another bucket or another server", async () => {
    await addStars([{ connectionId: "old", bucket: "docs", key: "a.txt", kind: "file" }]);
    removal.inspect.mockResolvedValue({ unfinished: [], transfers: 0, uploads: 0, starred: 1, recent: 0 });
    for (const change of [{ bucket: "archive" }, { endpoint: "http://localhost:9000" }]) {
      await expect(editActions(before).plan(edited(change))).resolves.toMatchObject({ starred: 1, kept: 0 });
    }
    await editActions(before).save(edited({ endpoint: "http://localhost:9000" }));
    expect(await listStarred("tested", "docs")).toEqual([]);
  });

  it("stores the new record before the old one is removed", async () => {
    removal.remove.mockImplementationOnce(async (connection: ConnectionSummary) => {
      expect((await stored()).map((profile) => profile.id).sort()).toEqual(["old", "tested"]);
      await vault.remove(connection.id);
    });
    await expect(editActions(before).save(moved)).resolves.toMatchObject({ connection: { id: "tested", bucket: "archive" }, oldRemoved: true });
    expect((await stored()).map((profile) => profile.id)).toEqual(["tested"]);
    await expect(keysAfterUnlock("tested")).resolves.toEqual(newKeys);
  });

  it("a new record that cannot be written leaves the old one, and removes nothing", async () => {
    const record = await stored();
    vi.spyOn(connectionStore, "put").mockRejectedValueOnce(new Error("quota"));
    await expect(editActions(before).save(moved)).rejects.toThrow("quota");
    expect(removal.remove).not.toHaveBeenCalled();
    await expect(stored()).resolves.toEqual(record);
    await expect(keysAfterUnlock("old")).resolves.toEqual(oldKeys);
  });

  it("an old record that cannot be removed is reported, and both stay", async () => {
    removal.remove.mockRejectedValueOnce(new Error("blocked"));
    await expect(editActions(before).save(moved)).resolves.toMatchObject({ oldRemoved: false });
    expect((await stored()).map((profile) => profile.id).sort()).toEqual(["old", "tested"]);
    await expect(keysAfterUnlock("old")).resolves.toEqual(oldKeys);
  });

  it("unfinished moves block it: nothing is written or removed (C-55)", async () => {
    removal.inspect.mockResolvedValue(plan([{ entry: {}, live: false }]));
    const record = await stored();
    await expect(editActions(before).plan(moved)).resolves.toEqual({ kind: "blocked", unfinished: 1 });
    await expect(editActions(before).save(moved)).rejects.toThrow("unfinished moves");
    expect(removal.remove).not.toHaveBeenCalled();
    await expect(stored()).resolves.toEqual(record);
  });
});
