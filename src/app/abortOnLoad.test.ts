import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTransfers } from "@/features/transfers";
import type { ConnectionSummary } from "@/lib/types";
import type { UploadRecord } from "@/lib/storage/db";
import { abortInterruptedUploads } from "./abortOnLoad";

let records: UploadRecord[] = [];
let held = new Set<string>();
const abortUpload = vi.fn<(client: unknown, target: { uploadId: string }) => Promise<void>>();
const deleted: string[] = [];
vi.mock("@/lib/storage/uploads", () => ({
  uploadStore: {
    list: () => Promise.resolve(records),
    delete: (id: string) => { deleted.push(id); records = records.filter((record) => record.id !== id); return Promise.resolve(); },
  },
}));
vi.mock("@/lib/storage/locks", () => ({ heldUploadIds: () => Promise.resolve(new Set(held)) }));
vi.mock("@/lib/s3", () => ({
  clientFor: () => ({}),
  abortUpload: (client: unknown, target: { uploadId: string }) => abortUpload(client, target),
  nameOf: (key: string) => key.slice(key.lastIndexOf("/") + 1),
}));

const connection: ConnectionSummary = {
  id: "new", name: "n", providerId: "custom", fields: {}, endpoint: "http://127.0.0.1:9000", region: "us-east-1",
  addressingStyle: "path", bucket: "b", access: "readWrite", createdAt: "2026-01-01T00:00:00.000Z",
};
const record = (id: string, over: Partial<UploadRecord> = {}): UploadRecord => ({
  id, connectionId: "old", endpoint: "http://127.0.0.1:9000", bucket: "b", key: `dir/${id}.bin`, uploadId: `up-${id}`, partSize: 8, size: 20, parts: [], startedAt: "2026-01-01T00:00:00.000Z", ...over,
});
const noSleep = () => Promise.resolve();

beforeEach(() => {
  records = [];
  held = new Set();
  deleted.length = 0;
  abortUpload.mockReset().mockResolvedValue(undefined);
  useTransfers.getState().reset();
});
afterEach(() => { useTransfers.getState().reset(); });

describe("abort-on-load (C-43, D-36)", () => {
  it("AC-41.5 aborts a stored upload for this endpoint and bucket, deletes the record and shows it as interrupted", async () => {
    records = [record("a")];
    await abortInterruptedUploads(connection, { sleep: noSleep });
    expect(abortUpload).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uploadId: "up-a" }));
    expect(deleted).toEqual(["a"]);
    expect(useTransfers.getState().interrupted).toEqual([{ id: "a", name: "a.bin" }]);
  });

  it("leaves records of another bucket or endpoint alone", async () => {
    records = [record("a", { bucket: "other" }), record("b", { endpoint: "https://elsewhere.test" })];
    await abortInterruptedUploads(connection, { sleep: noSleep });
    expect(abortUpload).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it("D-36 never aborts an upload whose lock stays held: it is alive in another tab", async () => {
    records = [record("a")];
    held = new Set(["a"]);
    await abortInterruptedUploads(connection, { sleep: noSleep });
    expect(abortUpload).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(useTransfers.getState().interrupted).toEqual([]);
  });

  it("a lock that is only being released after a reload is aborted on a later round", async () => {
    records = [record("a")];
    held = new Set(["a"]);
    let sleeps = 0;
    await abortInterruptedUploads(connection, { sleep: () => { sleeps += 1; held = new Set(); return Promise.resolve(); } });
    expect(sleeps).toBe(1);
    expect(abortUpload).toHaveBeenCalledTimes(1);
    expect(useTransfers.getState().interrupted).toHaveLength(1);
  });

  it("an abort the provider refuses once is tried again, and succeeds", async () => {
    records = [record("a")];
    abortUpload.mockRejectedValueOnce(new Error("refused")).mockResolvedValue(undefined);
    await abortInterruptedUploads(connection, { sleep: noSleep });
    expect(abortUpload).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual(["a"]);
  });

  it("an abort that keeps failing keeps its record for the next load and reports nothing", async () => {
    records = [record("a")];
    abortUpload.mockRejectedValue(new Error("refused"));
    await abortInterruptedUploads(connection, { sleep: noSleep });
    expect(abortUpload).toHaveBeenCalledTimes(4);
    expect(records).toHaveLength(1);
    expect(useTransfers.getState().interrupted).toEqual([]);
  });

  it("a record whose own tab finished it meanwhile is not reported as interrupted", async () => {
    records = [record("a")];
    held = new Set(["a"]);
    await abortInterruptedUploads(connection, { sleep: () => { records = []; held = new Set(); return Promise.resolve(); } });
    expect(abortUpload).not.toHaveBeenCalled();
    expect(useTransfers.getState().interrupted).toEqual([]);
  });

  it("does nothing, and loads nothing else, when there is no record", async () => {
    await abortInterruptedUploads(connection, { sleep: noSleep });
    expect(abortUpload).not.toHaveBeenCalled();
  });
});
