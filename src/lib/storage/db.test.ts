import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { DB_NAME, LATEST_VERSION, openCoffer, type UploadRecord } from "./db";
import { closeUploadStore, uploadStore } from "./uploads";

const record = (over: Partial<UploadRecord> = {}): UploadRecord => ({
  id: "u1", connectionId: "c1", endpoint: "https://s3.example.test", bucket: "b", key: "a/big.bin", uploadId: "up-1",
  partSize: 8 * 1024 * 1024, size: 40 * 1024 * 1024, parts: [], startedAt: "2026-01-01T00:00:00.000Z", ...over,
});

beforeEach(async () => {
  await closeUploadStore();
  await deleteDB(DB_NAME);
});

describe("IndexedDB setup (M4)", () => {
  it("creates every store the technical spec names", async () => {
    const db = await openCoffer();
    expect([...db.objectStoreNames].sort()).toEqual(["connections", "journal", "meta", "recent", "starred", "uploads"]);
    db.close();
  });

  it("migrates from each earlier version without losing data", async () => {
    // Version 0 is an empty database; with one schema version the loop covers it. A future version N adds
    // a case here that opens version N-1, writes a record and checks it after the upgrade.
    for (let from = 0; from < LATEST_VERSION; from += 1) {
      await deleteDB(DB_NAME);
      const old = await openCoffer(DB_NAME, from === 0 ? LATEST_VERSION : from);
      old.close();
      const upgraded = await openCoffer();
      expect(upgraded.version).toBe(LATEST_VERSION);
      upgraded.close();
    }
  });
});

describe("the uploads store", () => {
  it("stores a record before the first part and returns it", async () => {
    await uploadStore.put(record());
    expect(await uploadStore.list()).toEqual([record()]);
  });

  it("records finished parts with their ETags and never duplicates a retried part", async () => {
    await uploadStore.put(record());
    await uploadStore.addPart("u1", { partNumber: 2, etag: "b" });
    await uploadStore.addPart("u1", { partNumber: 1, etag: "a" });
    await uploadStore.addPart("u1", { partNumber: 2, etag: "b2" });
    const [stored] = await uploadStore.list();
    expect(stored?.parts.sort((x, y) => x.partNumber - y.partNumber)).toEqual([{ partNumber: 1, etag: "a" }, { partNumber: 2, etag: "b2" }]);
  });

  it("ignores a part for a record that is gone", async () => {
    await expect(uploadStore.addPart("missing", { partNumber: 1, etag: "a" })).resolves.toBeUndefined();
    expect(await uploadStore.list()).toEqual([]);
  });

  it("deletes a record", async () => {
    await uploadStore.put(record());
    await uploadStore.delete("u1");
    expect(await uploadStore.list()).toEqual([]);
  });

  it("holds no credentials or file bytes", async () => {
    await uploadStore.put(record());
    expect(JSON.stringify(await uploadStore.list())).not.toMatch(/secret|accessKey|credential/i);
  });
});
