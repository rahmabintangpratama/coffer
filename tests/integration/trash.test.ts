import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRestore } from "@/features/trash/restore";
import { toTrashItems } from "@/features/trash/model";
import { DELETE_BATCH, deleteKeys, deleteUnder } from "@/lib/s3/delete";
import { existingKeys } from "@/lib/s3/conflicts";
import { runOperation } from "@/lib/s3/operations";
import { newBatchId, trashKeyOf } from "@/lib/s3/trash";
import { startEntry, type JournalStore } from "@/lib/storage/journal";
import type { JournalEntry } from "@/lib/types";
import { createBucket, createClient } from "./client";
import { admin } from "./config";
import { putMany } from "./seed";

// FR-36, FR-70, FR-71 and C-19 against a real server.
const client: S3Client = createClient(admin);
let bucket = "";

function memoryJournal(): JournalStore {
  const entries = new Map<string, JournalEntry>();
  return {
    put: (entry) => { entries.set(entry.id, entry); return Promise.resolve(); },
    get: (id) => Promise.resolve(entries.get(id)),
    list: () => Promise.resolve([...entries.values()]),
    delete: (id) => { entries.delete(id); return Promise.resolve(); },
  };
}

async function keys(prefix: string): Promise<string[]> {
  const all: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ...(token === undefined ? {} : { ContinuationToken: token }) }));
    all.push(...(page.Contents ?? []).map((object) => object.Key ?? ""));
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return all.sort();
}

/** What is under `root` outside its trash. */
const live = async (root: string) => (await keys(root)).filter((key) => !key.startsWith(`${root}.trash/`));

const unique = (name: string) => `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}/`;
const put = (key: string, body: string) => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
const read = async (key: string) => (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body?.transformToString();
const run = (kind: JournalEntry["kind"], source: string, target: string) =>
  runOperation({ client, journal: memoryJournal(), entry: startEntry({ id: crypto.randomUUID(), kind, connectionId: "c", endpoint: "http://x", bucket, source, target }) });
const trashIt = (root: string, key: string, batch = newBatchId()) => run("trash", key, trashKeyOf(root, batch, key));
const noAsk = () => Promise.reject(new Error("should not ask"));
const exists = async (key: string) => (await existingKeys(client, { bucket, keys: [key] })).has(key);
const listed = async (root: string) => toTrashItems(root, (await keys(`${root}.trash/`)).map((key) => ({ key, size: 0 })));
const planFor = async (root: string, pick: (all: Awaited<ReturnType<typeof listed>>) => Awaited<ReturnType<typeof listed>>, ask: Parameters<typeof planRestore>[3]["ask"] = noAsk) => {
  const all = await listed(root);
  return planRestore(pick(all), all, root, { existing: (found) => existingKeys(client, { bucket, keys: found }), exists, ask });
};

beforeAll(async () => { bucket = await createBucket(client, "trash"); });
afterAll(() => { client.destroy(); });

describe("AC-36.1, AC-36.4, AC-36.6 trash", () => {
  it("moves a file under a batch prefix and a folder with everything in it, placeholder included", async () => {
    const root = unique("t1");
    await putMany(client, bucket, [`${root}a.txt`, `${root}dir/`, `${root}dir/b.txt`, `${root}dir/sub/c.txt`]);
    const batch = newBatchId();
    await trashIt(root, `${root}a.txt`, batch);
    await trashIt(root, `${root}dir/`, batch);
    expect(await live(root)).toEqual([]);
    expect(await keys(`${root}.trash/`)).toEqual([`${root}.trash/${batch}/a.txt`, `${root}.trash/${batch}/dir/`, `${root}.trash/${batch}/dir/b.txt`, `${root}.trash/${batch}/dir/sub/c.txt`]);
  });

  it("AC-36.6 trashing the same key twice keeps both copies in separate batches", async () => {
    const root = unique("t2");
    await put(`${root}a.txt`, "first");
    await trashIt(root, `${root}a.txt`);
    await put(`${root}a.txt`, "second");
    await trashIt(root, `${root}a.txt`);
    const stored = await keys(`${root}.trash/`);
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((key) => key.split("/")[2])).size).toBe(2);
    expect((await Promise.all(stored.map(read))).sort()).toEqual(["first", "second"]);
  });

  it("AC-36.3 Undo puts a trashed folder back exactly", async () => {
    const root = unique("t3");
    await putMany(client, bucket, [`${root}dir/a.txt`, `${root}dir/n/b.txt`]);
    const batch = newBatchId();
    await trashIt(root, `${root}dir/`, batch);
    await run("restore", trashKeyOf(root, batch, `${root}dir/`), `${root}dir/`);
    expect(await live(root)).toEqual([`${root}dir/a.txt`, `${root}dir/n/b.txt`]);
    expect(await keys(`${root}.trash/`)).toEqual([]);
  });
});

describe("AC-70.2 and AC-70.3 restore", () => {
  it("restores the objects of a batch to their original keys, as one prefix when nothing clashes and all are selected", async () => {
    const root = unique("r1");
    await putMany(client, bucket, [`${root}a.txt`, `${root}d/b.txt`]);
    const batch = newBatchId();
    await trashIt(root, `${root}a.txt`, batch);
    await trashIt(root, `${root}d/`, batch);
    const moves = await planFor(root, (all) => all);
    expect(moves).toEqual([{ source: `${root}.trash/${batch}/`, target: root }]);
    for (const move of moves) await run("restore", move.source, move.target);
    expect(await live(root)).toEqual([`${root}a.txt`, `${root}d/b.txt`]);
    expect(await keys(`${root}.trash/`)).toEqual([]);
  });

  it("a partial selection restores only those objects, one move each", async () => {
    const root = unique("r2");
    await putMany(client, bucket, [`${root}a.txt`, `${root}b.txt`]);
    const batch = newBatchId();
    await trashIt(root, `${root}a.txt`, batch);
    await trashIt(root, `${root}b.txt`, batch);
    const moves = await planFor(root, (all) => all.filter((item) => item.name === "a.txt"));
    expect(moves).toEqual([{ source: `${root}.trash/${batch}/a.txt`, target: `${root}a.txt` }]);
    for (const move of moves) await run("restore", move.source, move.target);
    expect(await live(root)).toEqual([`${root}a.txt`]);
    expect(await keys(`${root}.trash/`)).toEqual([`${root}.trash/${batch}/b.txt`]);
  });

  it("an original key that exists now asks; Keep both numbers the restored one and Replace overwrites", async () => {
    const root = unique("r3");
    await put(`${root}a.txt`, "old");
    await trashIt(root, `${root}a.txt`);
    await put(`${root}a.txt`, "new");
    const asked: string[] = [];
    const both = await planFor(root, (all) => all, (question) => { asked.push(question.key); return Promise.resolve({ choice: "keepBoth", applyToAll: false }); });
    expect(asked).toEqual([`${root}a.txt`]);
    expect(both.map((move) => move.target)).toEqual([`${root}a (1).txt`]);
    for (const move of both) await run("restore", move.source, move.target);
    expect(await read(`${root}a.txt`)).toBe("new");
    expect(await read(`${root}a (1).txt`)).toBe("old");

    await trashIt(root, `${root}a (1).txt`);
    await put(`${root}a (1).txt`, "newer");
    const replace = await planFor(root, (all) => all, () => Promise.resolve({ choice: "replace", applyToAll: false }));
    for (const move of replace) await run("restore", move.source, move.target);
    expect(await read(`${root}a (1).txt`)).toBe("old");
  });

  it("Skip leaves the item in the trash", async () => {
    const root = unique("r4");
    await put(`${root}a.txt`, "old");
    await trashIt(root, `${root}a.txt`);
    await put(`${root}a.txt`, "new");
    const moves = await planFor(root, (all) => all, () => Promise.resolve({ choice: "skip", applyToAll: false }));
    expect(moves).toEqual([]);
    expect((await keys(`${root}.trash/`)).length).toBe(1);
  });
});

/** Counts the requests of a command and can reject one kind. */
function watched(reject?: string): { faulty: S3Client; count: (name: string) => number } {
  const faulty = createClient(admin);
  const counts = new Map<string, number>();
  faulty.middlewareStack.add(
    (next, context) => async (args) => {
      const name = context.commandName ?? "";
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (name === reject) throw Object.assign(new Error("not implemented"), { name: "NotImplemented", $metadata: { httpStatusCode: 501 } });
      return next(args);
    },
    { step: "build", name: "countCommands" },
  );
  return { faulty, count: (name) => counts.get(name) ?? 0 };
}

describe("AC-71.3 delete forever", () => {
  it("deletes 2,500 objects in batches of up to 1,000", async () => {
    const root = unique("d1");
    const all = Array.from({ length: 2500 }, (_, n) => `${root}f-${n.toString().padStart(4, "0")}.txt`);
    await putMany(client, bucket, all, 48);
    const { faulty, count } = watched();
    const progress: number[] = [];
    const result = await deleteKeys(faulty, all, { bucket, onProgress: (done) => progress.push(done) });
    expect(result).toEqual({ deleted: 2500, failed: [] });
    expect(count("DeleteObjectsCommand")).toBe(3);
    expect(progress).toEqual([1000, 2000, 2500]);
    expect(await live(root)).toEqual([]);
    faulty.destroy();
    expect(DELETE_BATCH).toBe(1000);
  }, 120_000);

  it("Empty trash lists and deletes everything under the prefix, page by page", async () => {
    const root = unique("d2");
    await putMany(client, bucket, Array.from({ length: 1500 }, (_, n) => `${root}.trash/20261122T090503Z-aaaaaa/f-${n.toString().padStart(4, "0")}.txt`), 48);
    const result = await deleteUnder(client, `${root}.trash/`, { bucket });
    expect(result).toEqual({ deleted: 1500, failed: [] });
    expect(await live(root)).toEqual([]);
  }, 120_000);

  it("a provider that rejects DeleteObjects gets one DeleteObject per key", async () => {
    const root = unique("d3");
    const some = Array.from({ length: 30 }, (_, n) => `${root}f-${n.toString()}.txt`);
    await putMany(client, bucket, some);
    const { faulty, count } = watched("DeleteObjectsCommand");
    const result = await deleteKeys(faulty, some, { bucket });
    expect(result).toEqual({ deleted: 30, failed: [] });
    // The batch call is tried once, then the fallback stays on for the rest.
    expect(count("DeleteObjectsCommand")).toBe(1);
    expect(count("DeleteObjectCommand")).toBe(30);
    expect(await live(root)).toEqual([]);
    faulty.destroy();
  });

  it("deleting keys that are already gone is not a failure", async () => {
    const root = unique("d4");
    expect(await deleteKeys(client, [`${root}never-there.txt`], { bucket })).toEqual({ deleted: 1, failed: [] });
  });
});
