// @vitest-environment node
import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectionStore } from "./connection-store";
import { closeSharedDb, DB_NAME, migrations, openCoffer, sharedDb, unsealDbForTests } from "./db";
import { forgetDevice, releaseStorage, storedReport } from "./forget";
import { INVENTORY, KNOWN_LOCAL_KEYS, NON_STORAGE_FILES } from "./inventory";
import { vault } from "./vault";

// FR-10, AC-10.3, AC-10.4, ADR-007: every storage location is in the inventory, and Forget clears every line of it.
const root = join(import.meta.dirname, "..", "..", "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const sources = [...walk(join(root, "src")), ...walk(join(root, "public"))]
  .filter((path) => /\.(ts|tsx|js)$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({ path: relative(root, path), text: readFileSync(path, "utf8") }));

/** Source code with comments removed, so a word in a comment is not a use. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the inventory covers every use of browser storage", () => {
  const API = /\b(localStorage|sessionStorage|indexedDB|openDB|openCoffer|caches\.|serviceWorker|BroadcastChannel)\b/;
  const named = new Set([...INVENTORY.flatMap((item) => item.files), ...NON_STORAGE_FILES]);

  it("a file that touches a storage API is named in the inventory", () => {
    const unnamed = sources.filter((source) => API.test(code(source.text)) && !named.has(source.path)).map((source) => source.path);
    expect(unnamed, "add the location to src/lib/storage/inventory.ts, What's stored and Forget this device").toEqual([]);
  });

  it("every file the inventory names exists", () => {
    const present = new Set(sources.map((source) => source.path));
    expect([...named].filter((path) => !present.has(path))).toEqual([]);
  });

  it("every coffer: key written in source is an inventory key", () => {
    const literal = /["'`](coffer:[a-z-]+)["'`]/g;
    const found = new Set<string>();
    for (const source of sources) for (const match of code(source.text).matchAll(literal)) found.add(match[1] ?? "");
    // coffer:vault is the BroadcastChannel name, not storage.
    found.delete("coffer:vault");
    expect([...found].filter((key) => !KNOWN_LOCAL_KEYS.includes(key))).toEqual([]);
  });

  it("the inventory lists every IndexedDB store", async () => {
    await closeSharedDb();
    const db = await openDB(`${DB_NAME}-shape`, migrations.length, { upgrade: (handle, old) => { for (let step = old; step < migrations.length; step += 1) migrations[step]?.(handle as never); } });
    const stores = [...db.objectStoreNames].sort();
    db.close();
    expect(INVENTORY.filter((item) => item.kind === "indexeddb").map((item) => item.id).sort()).toEqual(stores);
  });
});

function fakeStorage(entries: Record<string, string>): Storage {
  const target = new Map(Object.entries(entries));
  return {
    get length() { return target.size; },
    clear: () => { target.clear(); },
    getItem: (key) => target.get(key) ?? null,
    key: (index) => [...target.keys()][index] ?? null,
    removeItem: (key) => { target.delete(key); },
    setItem: (key, value) => { target.set(key, value); },
  };
}

describe("AC-10.3 and AC-10.4 Forget this device", () => {
  beforeEach(async () => {
    unsealDbForTests();
    await closeSharedDb();
    await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => { resolve(); }; });
  });
  afterEach(async () => {
    vault.lock();
    await closeSharedDb();
  });

  it("clears every inventory line, leaves other sites' keys alone, and drops the keys in memory", async () => {
    const local = fakeStorage({ "coffer:settings": "{}", "coffer:theme": "dark", "coffer:saved": "1", "coffer:signal": "x", "other:keep": "stay" });
    const session = fakeStorage({ a: "1" });
    (globalThis as { window?: unknown }).window = { localStorage: local, sessionStorage: session };

    const handle = await sharedDb();
    await handle.put("journal", { id: "j1", status: "interrupted" } as never);
    await handle.put("uploads", { id: "u1" } as never);
    await handle.put("starred", { connectionId: "c", bucket: "b", key: "k" });
    await handle.put("recent", { connectionId: "c", bucket: "b", key: "k" });
    await handle.put("meta", { key: "m", value: 1 });
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    await vault.save({ id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "http://x", region: "r", addressingStyle: "path", access: "readWrite", createdAt: "2026-01-01T00:00:00Z" }, "correct horse battery");
    expect(await storedReport()).toEqual({ connections: 1, journal: 1, starred: 1, recent: 1, uploads: 1 });

    const cleared: string[] = [];
    const caches = { keys: () => Promise.resolve(["v1"]), delete: (name: string) => { cleared.push(`cache:${name}`); return Promise.resolve(true); } } as unknown as CacheStorage;
    const serviceWorker = { getRegistrations: () => Promise.resolve([{ unregister: () => { cleared.push("sw"); return Promise.resolve(true); } }]) } as unknown as ServiceWorkerContainer;
    await forgetDevice({ localStorage: local, sessionStorage: session, caches, serviceWorker });

    // The database is gone: opening it again finds empty stores.
    const reopened = await openCoffer();
    for (const name of reopened.objectStoreNames) expect(await reopened.count(name), name).toBe(0);
    reopened.close();
    expect(local.length).toBe(1);
    expect(local.getItem("other:keep")).toBe("stay");
    expect(session.length).toBe(0);
    expect(cleared.sort()).toEqual(["cache:v1", "sw"]);
    expect(vault.isUnlocked()).toBe(false);
    await expect(vault.credentialsFor("c1")).rejects.toThrow("locked");
    delete (globalThis as { window?: unknown }).window;
  });

  it("stops running transfers before the stores go away", async () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeStorage({}), sessionStorage: fakeStorage({}) };
    vault.put("c1", { accessKeyId: "AK", secretAccessKey: "SK" });
    const lease = vault.lease("c1");
    // A transfer cleans up when it is aborted (AbortMultipartUpload) and only then lets go of its lease; Forget waits for that.
    let cleaned = false;
    lease.signal.addEventListener("abort", () => { setTimeout(() => { cleaned = true; lease.release(); }, 50); });
    await forgetDevice({ localStorage: fakeStorage({}), sessionStorage: fakeStorage({}) });
    expect(lease.signal.aborted).toBe(true);
    expect(cleaned).toBe(true);
    expect(vault.leaseCount()).toBe(0);
    delete (globalThis as { window?: unknown }).window;
  });

  it("when another tab deletes the database this page closes its handle and refuses to reopen it", async () => {
    await sharedDb();
    await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => { resolve(); }; });
    await expect(sharedDb()).rejects.toThrow("storage was removed");
  });

  it("after Forget this page cannot reopen the database; the others are told to let go the same way", async () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeStorage({}), sessionStorage: fakeStorage({}) };
    await releaseStorage();
    await expect(connectionStore.list()).rejects.toThrow("storage was removed");
    delete (globalThis as { window?: unknown }).window;
  });
});
