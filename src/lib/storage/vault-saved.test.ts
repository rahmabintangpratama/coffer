// @vitest-environment node
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionStore } from "./connection-store";
import { deriveKey, fromBase64Url, KDF_ITERATIONS, newKdfParams, seal, toBase64Url, WrongPassphraseError } from "./crypto";
import { closeSharedDb, DB_NAME } from "./db";
import { vault } from "./vault";

// FR-8, FR-9, FR-102, C-27, ADR-005: the saved mode of the vault, against fake IndexedDB and real Web Crypto.
const PASS = "correct horse battery staple";
const keys = { accessKeyId: "AKFAKEFAKEFAKEFAKE00", secretAccessKey: "fake-secret-key-for-tests-only", sessionToken: "fake-session-token" };
const summary = (id: string) => ({
  id, name: `Test · ${id}`, providerId: "custom", fields: { bucket: id }, endpoint: "http://127.0.0.1:9000", region: "us-east-1",
  addressingStyle: "path" as const, bucket: id, access: "readWrite" as const, createdAt: "2026-11-22T00:00:00.000Z",
});

const store = new Map<string, string>();
const fakeStorage = (target: Map<string, string>): Storage => ({
  get length() { return target.size; },
  clear: () => { target.clear(); },
  getItem: (key) => target.get(key) ?? null,
  key: (index) => [...target.keys()][index] ?? null,
  removeItem: (key) => { target.delete(key); },
  setItem: (key, value) => { target.set(key, value); },
});

beforeEach(async () => {
  store.clear();
  (globalThis as { window?: unknown }).window = { localStorage: fakeStorage(store) };
  await closeSharedDb();
  await deleteDB(DB_NAME);
});
afterEach(async () => {
  vault.stopLeases();
  vault.lock();
  await closeSharedDb();
  delete (globalThis as { window?: unknown }).window;
});

async function saveFirst(id = "c1"): Promise<void> {
  vault.put(id, keys);
  await vault.save(summary(id), PASS);
}

describe("AC-8.3 save on this device", () => {
  it("stores the profile with a sealed record and no plaintext, and marks the device", async () => {
    await saveFirst();
    const [profile] = await connectionStore.list();
    expect(profile?.credentials).toMatchObject({ storage: "encrypted", v: 1, cipher: "AES-GCM", kdf: "PBKDF2", iterations: KDF_ITERATIONS });
    expect(JSON.stringify(profile)).not.toContain(keys.secretAccessKey);
    expect(JSON.stringify(profile)).not.toContain(keys.accessKeyId);
    expect(store.get("coffer:saved")).toBe("1");
  });

  it("C-34 refuses a first passphrase under 12 characters even when the form did not", async () => {
    vault.put("c1", keys);
    await expect(vault.save(summary("c1"), "eleven char")).rejects.toMatchObject({ name: "WeakPassphraseError" });
    expect(await vault.savedCount()).toBe(0);
    await vault.save(summary("c1"), "twelve chars!");
    expect(await vault.savedCount()).toBe(1);
  });

  it("needs a passphrase for the first save, and only for a connection whose keys are in memory", async () => {
    vault.put("c1", keys);
    await expect(vault.save(summary("c1"))).rejects.toThrow("locked");
    await expect(vault.save(summary("nope"), PASS)).rejects.toThrow("locked");
  });

  it("a second saved connection while unlocked reuses the passphrase, key and salt", async () => {
    await saveFirst("c1");
    vault.put("c2", { accessKeyId: "AK2", secretAccessKey: "SK2" });
    await vault.save(summary("c2"));
    const [a, b] = await connectionStore.list();
    expect(a?.credentials.storage === "encrypted" && b?.credentials.storage === "encrypted" && a.credentials.salt === b.credentials.salt).toBe(true);
    expect(a?.credentials.storage === "encrypted" && b?.credentials.storage === "encrypted" && a.credentials.iv !== b.credentials.iv).toBe(true);
  });

  it("a save while locked must open the existing records with the same passphrase", async () => {
    await saveFirst("c1");
    vault.lock();
    vault.put("c2", { accessKeyId: "AK2", secretAccessKey: "SK2" });
    await expect(vault.save(summary("c2"), "another long passphrase")).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(await vault.savedCount()).toBe(1);
    await vault.save(summary("c2"), PASS);
    expect(await vault.savedCount()).toBe(2);
    expect(vault.isUnlocked()).toBe(true);
    await expect(vault.credentialsFor("c1")).resolves.toEqual(keys);
  });
});

describe("AC-9.1 to AC-9.4 unlock and lock", () => {
  it("lock drops the keys and the key; unlock with the passphrase brings them back", async () => {
    await saveFirst();
    expect(vault.isUnlocked()).toBe(true);
    vault.lock();
    expect(vault.isUnlocked()).toBe(false);
    await expect(vault.credentialsFor("c1")).rejects.toThrow("locked");
    const opened = await vault.unlock(PASS);
    expect(opened.map((profile) => profile.id)).toEqual(["c1"]);
    expect(JSON.stringify(opened)).not.toContain(keys.secretAccessKey);
    expect(vault.isUnlocked()).toBe(true);
    await expect(vault.credentialsFor("c1")).resolves.toEqual(keys);
  });

  it("AC-9.2 a wrong passphrase leaves it locked", async () => {
    await saveFirst();
    vault.lock();
    await expect(vault.unlock("not the passphrase")).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(vault.isUnlocked()).toBe(false);
    await expect(vault.credentialsFor("c1")).rejects.toThrow("locked");
  });

  it("unlock with nothing saved opens nothing", async () => {
    await expect(vault.unlock(PASS)).resolves.toEqual([]);
    expect(vault.isUnlocked()).toBe(false);
  });

  it("tells listeners about a lock and an unlock", async () => {
    const seen: string[] = [];
    const offLock = vault.onLock(() => seen.push("lock"));
    const offUnlock = vault.onUnlock(() => seen.push("unlock"));
    await saveFirst();
    vault.lock();
    await vault.unlock(PASS);
    offLock();
    offUnlock();
    expect(seen).toEqual(["unlock", "lock", "unlock"]);
  });

  it("a record that is not one of ours is refused before any key is derived from it", async () => {
    await saveFirst();
    const [profile] = await connectionStore.list();
    if (profile?.credentials.storage !== "encrypted") throw new Error("no sealed record");
    vault.lock();
    for (const bad of [{ iterations: 0 }, { iterations: 5e12 }, { iterations: 1.5 }, { cipher: "AES-CBC" }, { v: 2 }, { salt: "not base64 !" }]) {
      await connectionStore.put({ ...profile, credentials: { ...profile.credentials, ...bad } as never });
      await expect(vault.unlock(PASS), JSON.stringify(bad)).rejects.toMatchObject({ name: "InvalidRecordError" });
    }
    await connectionStore.put(profile);
    await expect(vault.unlock(PASS)).resolves.toHaveLength(1);
  });

  it("re-encryption writes every record in one transaction, and a failed write leaves the old records readable", async () => {
    const weak = newKdfParams(1000);
    const key = await deriveKey(PASS, weak);
    for (const id of ["c1", "c2"]) await connectionStore.put({ ...summary(id), credentials: { storage: "encrypted", ...(await seal(key, id, keys, weak)) } });
    const failing = vi.spyOn(connectionStore, "putAll").mockRejectedValue(new Error("quota"));
    await expect(vault.unlock(PASS)).rejects.toThrow("quota");
    failing.mockRestore();
    const salts = new Set((await connectionStore.list()).map((profile) => (profile.credentials.storage === "encrypted" ? profile.credentials.salt : "")));
    expect(salts.size).toBe(1);
    await expect(vault.unlock(PASS)).resolves.toHaveLength(2);
    const after = new Set((await connectionStore.list()).map((profile) => (profile.credentials.storage === "encrypted" ? profile.credentials.salt : "")));
    expect(after.size).toBe(1);
    expect(after.has(toBase64Url(weak.salt))).toBe(false);
  });

  it("a record sealed under a lower work factor is sealed again, under a fresh salt, when it is unlocked", async () => {
    const weak = newKdfParams(1000);
    const sealed = await seal(await deriveKey(PASS, weak), "c1", keys, weak);
    await connectionStore.put({ ...summary("c1"), credentials: { storage: "encrypted", ...sealed } });
    await vault.unlock(PASS);
    const [after] = await connectionStore.list();
    expect(after?.credentials.storage === "encrypted" && after.credentials.iterations).toBe(KDF_ITERATIONS);
    expect(after?.credentials.storage === "encrypted" && after.credentials.salt).not.toBe(toBase64Url(weak.salt));
    vault.lock();
    await expect(vault.unlock(PASS)).resolves.toHaveLength(1);
  });
});

describe("AC-102.1, AC-11.4 reveal and remove", () => {
  it("reveal needs the passphrase every time, even while unlocked", async () => {
    await saveFirst();
    expect(vault.isUnlocked()).toBe(true);
    await expect(vault.reveal("c1", "not the passphrase")).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(vault.reveal("c1", PASS)).resolves.toBe(keys.secretAccessKey);
  });

  it("removing one connection deletes only its keys; removing the last clears the hint and the key", async () => {
    await saveFirst("c1");
    vault.put("c2", { accessKeyId: "AK2", secretAccessKey: "SK2" });
    await vault.save(summary("c2"));
    await vault.remove("c1");
    expect((await vault.saved()).map((profile) => profile.id)).toEqual(["c2"]);
    await expect(vault.credentialsFor("c1")).rejects.toThrow("locked");
    await expect(vault.credentialsFor("c2")).resolves.toMatchObject({ accessKeyId: "AK2" });
    expect(store.get("coffer:saved")).toBe("1");
    await vault.remove("c2");
    expect(await vault.savedCount()).toBe(0);
    expect(store.has("coffer:saved")).toBe(false);
    expect(vault.isUnlocked()).toBe(false);
  });
});

describe("C-27 and C-38 leases", () => {
  it("a lease survives a lock and keeps working keys; release ends it", async () => {
    await saveFirst();
    const lease = vault.lease("c1");
    expect(vault.leaseCount()).toBe(1);
    vault.lock();
    expect(lease.credentials).toEqual(keys);
    expect(lease.signal.aborted).toBe(false);
    expect(() => vault.lease("c1")).toThrow("locked");
    lease.release();
    expect(vault.leaseCount()).toBe(0);
  });

  it("a lease holds a copy: changing it changes nothing in the vault", async () => {
    await saveFirst();
    const lease = vault.lease("c1");
    (lease.credentials as { secretAccessKey: string }).secretAccessKey = "changed";
    await expect(vault.credentialsFor("c1")).resolves.toEqual(keys);
    lease.release();
  });

  it("AC-9.6 a queued transfer waits for the unlock, then gets its lease", async () => {
    await saveFirst();
    vault.lock();
    let got: string | null = null;
    const waiting = vault.leaseWhenUnlocked("c1").then((lease) => { got = lease.credentials.accessKeyId; return lease; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(got).toBeNull();
    expect(vault.leaseCount()).toBe(0);
    await vault.unlock(PASS);
    const lease = await waiting;
    expect(got).toBe(keys.accessKeyId);
    expect(vault.leaseCount()).toBe(1);
    lease.release();
  });

  it("C-38 stopping the leases aborts the running ones and leaves the waiting ones queued (AC-9.6)", async () => {
    await saveFirst();
    const running = vault.lease("c1");
    vault.lock();
    let settled = false;
    const waiting = vault.leaseWhenUnlocked("c1").then((lease) => { settled = true; return lease; }, () => { settled = true; });
    vault.stopLeases();
    expect(running.signal.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    running.release();
    await vault.unlock(PASS);
    const lease = await waiting;
    expect(lease?.credentials.accessKeyId).toBe(keys.accessKeyId);
    lease?.release();
  });

  it("Forget stops the waiting ones as well, since nothing will be there to start them", async () => {
    await saveFirst();
    vault.lock();
    const waiting = vault.leaseWhenUnlocked("c1");
    vault.stopLeases({ includeWaiting: true });
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });

  it("leasesSettled resolves when the last lease is released, or after the timeout", async () => {
    await saveFirst();
    const lease = vault.lease("c1");
    const settled = vault.leasesSettled(5000);
    setTimeout(() => { lease.release(); }, 30);
    await settled;
    expect(vault.leaseCount()).toBe(0);
    const stuck = vault.lease("c1");
    const started = Date.now();
    await vault.leasesSettled(80);
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
    stuck.release();
  });

  it("a waiter can be abandoned with its own signal", async () => {
    const controller = new AbortController();
    const waiting = vault.leaseWhenUnlocked("nobody", controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("key handling: nothing readable reaches storage", () => {
  /** Everything this origin would hold: all IndexedDB stores, localStorage and sessionStorage (empty here). */
  async function dumpStorage(): Promise<string> {
    const parts: string[] = [JSON.stringify([...store.entries()])];
    const handle = await (await import("./db")).sharedDb();
    for (const name of handle.objectStoreNames) parts.push(JSON.stringify(await handle.getAll(name)));
    return parts.join("\n");
  }

  it("after save and after lock the dump holds no plaintext key and no exported key material", async () => {
    await saveFirst();
    // The raw bytes of the derived key, made once by an extractable derivation of the same passphrase and salt, so the
    // dump can be searched for them in every encoding.
    const [profile] = await connectionStore.list();
    if (profile?.credentials.storage !== "encrypted") throw new Error("no sealed record");
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(PASS), "PBKDF2", false, ["deriveBits"]);
    const raw = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(profile.credentials.salt) as BufferSource, iterations: profile.credentials.iterations }, material, 256));
    const spellings = [toBase64Url(raw), btoa(String.fromCharCode(...raw)), Array.from(raw, (byte) => byte.toString(16).padStart(2, "0")).join(""), JSON.stringify(Array.from(raw))];
    const secrets = [keys.accessKeyId, keys.secretAccessKey, keys.sessionToken, PASS, ...spellings];

    for (const moment of ["after save", "after lock", "after unlock"]) {
      if (moment === "after lock") vault.lock();
      if (moment === "after unlock") await vault.unlock(PASS);
      const dump = await dumpStorage();
      for (const secret of secrets) expect(dump, `${moment}: ${secret.slice(0, 6)}`).not.toContain(secret);
    }
  });

  it("a key derived the way the vault does it is not extractable, so it cannot be exported", async () => {
    await saveFirst();
    const keyOf = async () => {
      const [profile] = await connectionStore.list();
      if (profile?.credentials.storage !== "encrypted") throw new Error("no sealed record");
      return deriveKey(PASS, { salt: fromBase64Url(profile.credentials.salt), iterations: profile.credentials.iterations });
    };
    const key = await keyOf();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("the vault exposes no way to read the key or the passphrase back", () => {
    const names = Object.keys(vault);
    expect(names.filter((name) => /key|passphrase|secret/i.test(name))).toEqual([]);
  });
});
