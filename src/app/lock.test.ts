// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as forget from "@/lib/storage/forget";
import { vault } from "@/lib/storage/vault";

// FR-9, FR-10, C-27, C-38: lock, Stop transfers and lock, and what another tab's message does here.
const posted: unknown[] = [];
vi.mock("@/lib/storage/tabsync", () => ({ tabSync: () => ({ post: (message: unknown) => { posted.push(message); }, subscribe: () => () => undefined }) }));

const storage = new Map<string, string>();
const saved1 = { id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "http://x", region: "r", addressingStyle: "path" as const, access: "readWrite" as const, createdAt: "2026-01-01T00:00:00Z" };

beforeEach(async () => {
  const { useSession } = await import("./session");
  useSession.setState({ connection: saved1, saved: [saved1], locked: null, adding: false, resuming: null });
  posted.length = 0;
  storage.clear();
  const local = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); }, length: 0, key: () => null, clear: () => { storage.clear(); } };
  vi.stubGlobal("window", { localStorage: local, location: { hash: "#/files/a", reload: vi.fn() } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vault.stopLeases();
  vault.lock();
});

async function modules() {
  const [lock, { useSession }, { useSettings }] = await Promise.all([import("./lock"), import("./session"), import("./settings")]);
  return { lock, useSession, useSettings };
}

describe("lockNow", () => {
  it("drops the keys, shows Locked with the reason and tells the other tabs, leaving running leases alone", async () => {
    const { lock, useSession } = await modules();
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    const lease = vault.lease("c1");
    useSession.getState().connect({ id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "http://x", region: "r", addressingStyle: "path", access: "readWrite", createdAt: "2026-01-01T00:00:00Z" });
    lock.lockNow("manual");
    expect(useSession.getState().locked).toEqual({ reason: "manual" });
    expect(useSession.getState().connection?.id).toBe("c1");
    await expect(vault.credentialsFor("c1")).rejects.toThrow("locked");
    expect(lease.signal.aborted).toBe(false);
    expect(posted).toEqual([{ type: "lock", stop: false }]);
    lease.release();
  });

  it("also drops what the screens hold about bucket objects: toasts and the interrupted list", async () => {
    const { lock } = await modules();
    const [{ useToasts }, { useOperations }] = await Promise.all([import("./toast"), import("@/features/operations/state")]);
    useToasts.getState().push({ message: "Moved secret-name.txt" });
    useOperations.getState().setInterrupted([{ id: "j1" } as never]);
    lock.lockNow("manual");
    expect(useToasts.getState().toasts).toEqual([]);
    expect(useOperations.getState().interrupted).toEqual([]);
  });

  it("an auto-lock records the setting that fired", async () => {
    const { lock, useSession, useSettings } = await modules();
    useSettings.setState({ autoLockMinutes: 30 });
    lock.lockNow("auto");
    expect(useSession.getState().locked).toEqual({ reason: "auto", minutes: 30 });
  });
});

describe("AC-9.8 what the lock shows", () => {
  const memory = { id: "m1", name: "n", providerId: "custom", fields: {}, endpoint: "http://x", region: "r", addressingStyle: "path" as const, access: "readWrite" as const, createdAt: "2026-01-01T00:00:00Z" };

  it("a connection that was only in memory gets its own screen state, with the connection to enter again", async () => {
    const { lock, useSession } = await modules();
    useSession.setState({ locked: null, saved: [], connection: memory });
    lock.applyTabMessage({ type: "lock", stop: false });
    expect(useSession.getState().locked).toEqual({ reason: "remote", memoryOnly: memory });
  });

  it("a saved connection gets the ordinary Unlock", async () => {
    const { lock, useSession } = await modules();
    useSession.setState({ locked: null, saved: [memory], connection: memory });
    lock.applyTabMessage({ type: "lock", stop: false });
    expect(useSession.getState().locked).toEqual({ reason: "remote" });
  });

  it("a tab still in onboarding drops its keys and shows no Locked screen; its form clears itself", async () => {
    const { lock, useSession } = await modules();
    useSession.setState({ locked: null, saved: [], connection: null });
    vault.put("pending", { accessKeyId: "AK", secretAccessKey: "SK" });
    const heard = vi.fn();
    const off = vault.onLock(heard);
    lock.applyTabMessage({ type: "lock", stop: false });
    off();
    expect(useSession.getState().locked).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
    await expect(vault.credentialsFor("pending")).rejects.toThrow("locked");
  });

  it("a tab that is already locked stays as it was", async () => {
    const { lock, useSession } = await modules();
    useSession.setState({ locked: { reason: "start" }, saved: [], connection: null });
    lock.applyTabMessage({ type: "lock", stop: false });
    expect(useSession.getState().locked).toEqual({ reason: "start" });
  });

  it("a tab adding a connection keeps its onboarding open under the lock", async () => {
    const { lock, useSession } = await modules();
    useSession.setState({ locked: null, saved: [memory], connection: memory, adding: true });
    lock.applyTabMessage({ type: "lock", stop: false });
    expect(useSession.getState()).toMatchObject({ adding: true, locked: { reason: "remote" } });
    useSession.getState().stopAdding();
    expect(useSession.getState().adding).toBe(false);
  });

  it("Enter the keys again opens onboarding for that connection, and ending it clears that", async () => {
    const { useSession } = await modules();
    useSession.setState({ locked: { reason: "remote", memoryOnly: memory }, connection: memory, adding: false, resuming: null });
    useSession.getState().startReenter(memory);
    expect(useSession.getState()).toMatchObject({ adding: true, resuming: { id: "m1" } });
    useSession.getState().stopAdding();
    expect(useSession.getState()).toMatchObject({ adding: false, resuming: null, locked: { memoryOnly: { id: "m1" } } });
  });
});

describe("stopTransfersAndLock (C-38)", () => {
  it("aborts the leases here, locks, and tells the other tabs to do the same", async () => {
    const { lock, useSession } = await modules();
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    const lease = vault.lease("c1");
    lock.stopTransfersAndLock();
    expect(lease.signal.aborted).toBe(true);
    expect(useSession.getState().locked?.reason).toBe("manual");
    expect(posted).toEqual([{ type: "lock", stop: true }]);
    lease.release();
  });
});

describe("a message from another tab", () => {
  it("lock locks this tab without telling the others again", async () => {
    const { lock, useSession } = await modules();
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    lock.applyTabMessage({ type: "lock", stop: false });
    expect(useSession.getState().locked).toEqual({ reason: "remote" });
    await expect(vault.credentialsFor("c1")).rejects.toThrow("locked");
    expect(posted).toEqual([]);
  });

  it("activity changes nothing here (it only keeps the auto-lock clocks together)", async () => {
    const { lock, useSession } = await modules();
    useSession.setState({ locked: null });
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    lock.applyTabMessage({ type: "activity" });
    expect(useSession.getState().locked).toBeNull();
    await expect(vault.credentialsFor("c1")).resolves.toMatchObject({ accessKeyId: "AK" });
  });

  it("lock with stop also aborts the transfers of this tab", async () => {
    const { lock } = await modules();
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    const lease = vault.lease("c1");
    lock.applyTabMessage({ type: "lock", stop: true });
    expect(lease.signal.aborted).toBe(true);
    lease.release();
  });

  it("forget lets go of the database and sends this tab to Welcome", async () => {
    const { lock } = await modules();
    const release = vi.spyOn(forget, "releaseStorage").mockResolvedValue();
    const reload = vi.fn();
    vi.stubGlobal("window", { localStorage: window.localStorage, location: { hash: "#/files/a", reload } });
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    const { useSession } = await modules();
    lock.applyTabMessage({ type: "forget" });
    // The keys are gone and Locked shows before anything else happens.
    expect(useSession.getState().locked).toEqual({ reason: "remote" });
    await expect(vault.credentialsFor("c1")).rejects.toThrow("locked");
    await vi.waitFor(() => { expect(reload).toHaveBeenCalled(); });
    expect(release).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });
});

describe("the session on a device with saved connections", () => {
  it("opens locked when the saved hint is set, and not otherwise", async () => {
    vi.resetModules();
    storage.set("coffer:saved", "1");
    expect((await import("./session")).useSession.getState().locked).toEqual({ reason: "start" });
    vi.resetModules();
    storage.clear();
    expect((await import("./session")).useSession.getState().locked).toBeNull();
  });

  it("a new connection leaves the lock behind; Unlock brings the saved one back", async () => {
    const { useSession } = await modules();
    const connection = { id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "http://x", region: "r", addressingStyle: "path" as const, access: "readWrite" as const, createdAt: "2026-01-01T00:00:00Z" };
    useSession.getState().lock({ reason: "start" });
    useSession.getState().startAdding();
    useSession.getState().connect(connection);
    expect(useSession.getState()).toMatchObject({ locked: null, adding: false, connection: { id: "c1" } });
    useSession.getState().lock({ reason: "manual" });
    useSession.getState().unlocked(connection, [connection]);
    expect(useSession.getState()).toMatchObject({ locked: null, saved: [{ id: "c1" }] });
  });
});
