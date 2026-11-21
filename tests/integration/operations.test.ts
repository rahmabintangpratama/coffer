import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyObject } from "@/lib/s3/copy";
import { runOperation } from "@/lib/s3/operations";
import { interrupt, resume, startEntry, type JournalStore } from "@/lib/storage/journal";
import type { JournalEntry } from "@/lib/types";
import { createBucket, createClient } from "./client";
import { admin } from "./config";
import { putMany } from "./seed";

// FR-32, FR-33, FR-34, FR-45: the move engine against a real server, with faults injected.
const client: S3Client = createClient(admin);
let bucket = "";
const MIB = 1024 * 1024;

function memoryJournal(): JournalStore & { entries: Map<string, JournalEntry>; writes: JournalEntry[]; freeze: () => void } {
  const entries = new Map<string, JournalEntry>();
  const writes: JournalEntry[] = [];
  let frozen = false;
  return {
    entries,
    writes,
    // After a crash nothing more is written: the store holds what it held at that instant.
    freeze: () => { frozen = true; },
    put: (entry) => { if (!frozen) { entries.set(entry.id, entry); writes.push(entry); } return Promise.resolve(); },
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

const unique = (name: string) => `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
const entryFor = (source: string, target: string, kind: JournalEntry["kind"] = "move"): JournalEntry =>
  startEntry({ id: unique("op"), kind, connectionId: "c1", endpoint: "http://x", bucket, source, target });
const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, n) => `${prefix}f-${n.toString().padStart(5, "0")}.txt`);

/**
 * A client that dies at the Nth request of a kind: that request and every request after it fail, and the
 * journal stops taking writes, as if the process had been killed at that instant. What the engine returns
 * afterwards is ignored; only the stored entry and the bucket matter.
 */
function crashing(journal: { freeze: () => void }, kind: string, nth: number): { faulty: S3Client; fired: () => boolean } {
  const faulty = createClient(admin);
  let seen = 0;
  let dead = false;
  faulty.middlewareStack.add(
    (next, context) => async (args) => {
      if (context.commandName === kind) seen += 1;
      if (!dead && context.commandName === kind && seen === nth) {
        dead = true;
        journal.freeze();
      }
      if (dead) throw Object.assign(new Error("injected crash"), { name: "InjectedCrash", $metadata: { httpStatusCode: 400 } });
      return next(args);
    },
    { step: "finalizeRequest", priority: "low", name: `crash-${kind}-${nth.toString()}` },
  );
  return { faulty, fired: () => dead };
}

beforeAll(async () => { bucket = await createBucket(client, "ops"); }, 30_000);
afterAll(() => { client.destroy(); });

describe("move, rename and copy (FR-32, FR-33, FR-34)", () => {
  it("AC-32.1 renames an object: copied, verified, source deleted, metadata kept", async () => {
    const source = `${unique("r")}/a.txt`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: source, Body: "hello", ContentType: "text/x-test", Metadata: { owner: "me" }, CacheControl: "max-age=60" }));
    const journal = memoryJournal();
    const target = source.replace("a.txt", "b.txt");
    const result = await runOperation({ client, journal, entry: entryFor(source, target, "rename") });
    expect(result).toMatchObject({ status: "done", phase: "finished", done: 1, total: 1 });
    expect(await keys(source.replace("a.txt", ""))).toEqual([target]);
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target }));
    expect(head).toMatchObject({ ContentType: "text/x-test", Metadata: { owner: "me" }, CacheControl: "max-age=60" });
  });

  it("AC-33.2 copies an object and keeps the source", async () => {
    const source = `${unique("c")}/a.txt`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: source, Body: "copy me" }));
    const result = await runOperation({ client, journal: memoryJournal(), entry: entryFor(source, `${source}.copy`, "copy") });
    expect(result.status).toBe("done");
    expect(await keys(source.slice(0, source.indexOf("/")))).toEqual([source, `${source}.copy`]);
  });

  it("AC-33.2 copies above the single-request limit with UploadPartCopy and keeps the metadata", async () => {
    const source = `${unique("big")}/big.bin`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: source, Body: new Uint8Array(12 * MIB).fill(3), ContentType: "application/x-big", Metadata: { k: "v" } }));
    const target = `${source}.copy`;
    // The limit is lowered to 5 MiB, so a 12 MiB object takes three ranged part copies.
    await copyObject(client, { bucket, sourceKey: source, targetKey: target, size: 12 * MIB, singleLimit: 5 * MIB, partSize: 5 * MIB });
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target }));
    expect(head.ContentLength).toBe(12 * MIB);
    expect(head).toMatchObject({ ContentType: "application/x-big", Metadata: { k: "v" } });
    const body = await (await client.send(new GetObjectCommand({ Bucket: bucket, Key: target }))).Body?.transformToByteArray();
    expect(body?.every((byte) => byte === 3)).toBe(true);
  }, 60_000);

  it("AC-32.4 renames a folder: every object under the prefix, the placeholder included, in key order", async () => {
    const root = unique("fold");
    await putMany(client, bucket, [`${root}/old/`, `${root}/old/a.txt`, `${root}/old/sub/b.txt`, `${root}/old/sub/deeper/c.txt`]);
    const result = await runOperation({ client, journal: memoryJournal(), entry: entryFor(`${root}/old/`, `${root}/new/`, "rename") });
    expect(result).toMatchObject({ status: "done", total: 4, done: 4 });
    expect(await keys(`${root}/`)).toEqual([`${root}/new/`, `${root}/new/a.txt`, `${root}/new/sub/b.txt`, `${root}/new/sub/deeper/c.txt`]);
  });

  it("round-trips awkward key names", async () => {
    const root = unique("awk");
    const names = ["#hash.txt", "q?mark.txt", "100%.txt", "plus+sign.txt", "日本語.txt", "with space.txt"];
    await putMany(client, bucket, names.map((name) => `${root}/src/${name}`));
    await runOperation({ client, journal: memoryJournal(), entry: entryFor(`${root}/src/`, `${root}/dst/`) });
    expect(await keys(`${root}/dst/`)).toEqual(names.map((name) => `${root}/dst/${name}`).sort());
    expect(await keys(`${root}/src/`)).toEqual([]);
  });

  it("refuses a folder moved into itself, and a key moved onto itself", async () => {
    await expect(runOperation({ client, journal: memoryJournal(), entry: entryFor("a/", "a/b/") })).rejects.toMatchObject({ code: "conflict" });
    await expect(runOperation({ client, journal: memoryJournal(), entry: entryFor("a/x", "a/x") })).rejects.toMatchObject({ code: "conflict" });
  });

  it("AC-45.1 writes the entry before the first request", async () => {
    const root = unique("wa");
    await putMany(client, bucket, [`${root}/s/a.txt`]);
    const journal = memoryJournal();
    let firstRequestSawEntry = false;
    const watching = createClient(admin);
    watching.middlewareStack.add(
      (next) => async (args) => {
        if (!firstRequestSawEntry) firstRequestSawEntry = journal.writes.length > 0;
        return next(args);
      },
      { step: "finalizeRequest", priority: "low", name: "watch-first-request" },
    );
    await runOperation({ client: watching, journal, entry: entryFor(`${root}/s/`, `${root}/t/`) });
    expect(firstRequestSawEntry).toBe(true);
    expect(journal.writes[0]).toMatchObject({ phase: "planning", total: 0, status: "running" });
    watching.destroy();
  });
});

/** Run an operation that crashes, then resume it from the stored entry with a fresh engine; return what the buckets hold. */
async function crashThenResume(options: { root: string; count: number; kind: string; nth: number }) {
  const { root, count, kind, nth } = options;
  const source = `${root}/src/`;
  const target = `${root}/dst/`;
  const original = numbered(source, count);
  await putMany(client, bucket, original);
  const journal = memoryJournal();
  const entry = entryFor(source, target);
  const { faulty, fired } = crashing(journal, kind, nth);
  await runOperation({ client: faulty, journal, entry }).catch(() => undefined);
  expect(fired()).toBe(true);
  faulty.destroy();
  // The process is gone: only the journal's stored entry survives.
  const stored = journal.entries.get(entry.id)!;
  expect(["running", "interrupted"]).toContain(stored.status);
  const result = await runOperation({ client, journal, entry: resume(interrupt(stored)) });
  return { result, original, source, target };
}

describe("AC-45.3 and AC-45.5 crash and resume (technical-spec 15.3)", () => {
  it("a crash right after a copy (before verify) loses and duplicates nothing", async () => {
    const { result, original, source, target } = await crashThenResume({ root: unique("c1"), count: 30, kind: "CopyObjectCommand", nth: 7 });
    expect(result).toMatchObject({ status: "done", done: 30, total: 30 });
    expect(await keys(source)).toEqual([]);
    expect(await keys(target)).toEqual(original.map((key) => key.replace("/src/", "/dst/")));
  }, 60_000);

  it("a crash after verify and before the delete deletes only the source on resume", async () => {
    const { result, original, source, target } = await crashThenResume({ root: unique("c2"), count: 30, kind: "DeleteObjectCommand", nth: 5 });
    expect(result.status).toBe("done");
    expect(await keys(source)).toEqual([]);
    expect(await keys(target)).toEqual(original.map((key) => key.replace("/src/", "/dst/")));
  }, 60_000);

  it("a crash half way through a folder resumes from the cursor", async () => {
    const root = unique("c3");
    const source = `${root}/src/`;
    await putMany(client, bucket, numbered(source, 120));
    const journal = memoryJournal();
    const entry = entryFor(source, `${root}/dst/`);
    const { faulty } = crashing(journal, "DeleteObjectCommand", 70);
    await runOperation({ client: faulty, journal, entry }).catch(() => undefined);
    faulty.destroy();
    const stored = journal.entries.get(entry.id)!;
    expect(stored.done).toBeGreaterThan(0);
    expect(stored.done).toBeLessThan(120);
    expect(stored.cursor).toBeDefined();
    const result = await runOperation({ client, journal, entry: resume(interrupt(stored)) });
    expect(result).toMatchObject({ status: "done", total: 120, done: 120 });
    expect(await keys(source)).toEqual([]);
    expect((await keys(`${root}/dst/`)).length).toBe(120);
  }, 90_000);

  it("a resume never deletes a source whose target does not verify", async () => {
    const root = unique("c4");
    const source = `${root}/src/`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${source}a.txt`, Body: "the real content" }));
    // A partial target of the wrong length, as a crashed copy could leave.
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${root}/dst/a.txt`, Body: "short" }));
    const result = await runOperation({ client, journal: memoryJournal(), entry: entryFor(source, `${root}/dst/`) });
    expect(result.status).toBe("done");
    const body = await (await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${root}/dst/a.txt` }))).Body?.transformToString();
    expect(body).toBe("the real content");
    expect(await keys(source)).toEqual([]);
  });

  it("a copy that cannot be verified keeps the source and reports the failure", async () => {
    const root = unique("c5");
    const source = `${root}/src/`;
    await putMany(client, bucket, [`${source}a.txt`, `${source}b.txt`]);
    // The first HeadObject after a copy lies about the length: the copy is not verified.
    const lying = createClient(admin);
    let heads = 0;
    lying.middlewareStack.add(
      (next, context) => async (args) => {
        const output = await next(args);
        if (context.commandName === "HeadObjectCommand") {
          heads += 1;
          // Heads 1 and 2 are the pre-check of each target (absent); the verify heads are 3 and 4.
          if (heads === 3) (output.output as { ContentLength?: number }).ContentLength = 999;
        }
        return output;
      },
      { step: "deserialize", name: "lie-about-length" },
    );
    const result = await runOperation({ client: lying, journal: memoryJournal(), entry: entryFor(source, `${root}/dst/`) });
    lying.destroy();
    expect(result.status).toBe("interrupted");
    expect(result.failures).toHaveLength(1);
    // Nothing was deleted without a verified copy.
    const left = await keys(source);
    expect(left.length).toBe(1);
  }, 60_000);

  it("SlowDown on copies is retried, and the move completes", async () => {
    const root = unique("c6");
    const source = `${root}/src/`;
    await putMany(client, bucket, numbered(source, 8));
    const slow = createClient(admin);
    let failures = 0;
    slow.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === "CopyObjectCommand" && failures < 4) {
          failures += 1;
          throw Object.assign(new Error("slow"), { name: "SlowDown", $metadata: { httpStatusCode: 503 } });
        }
        return next(args);
      },
      { step: "finalizeRequest", priority: "low", name: "slowdown-copies" },
    );
    const result = await runOperation({ client: slow, journal: memoryJournal(), entry: entryFor(source, `${root}/dst/`) });
    slow.destroy();
    expect(result).toMatchObject({ status: "done", done: 8 });
    expect(await keys(source)).toEqual([]);
    expect((await keys(`${root}/dst/`)).length).toBe(8);
  }, 60_000);

  it("a cancel leaves the entry interrupted with what is done kept, and resumes to the same end", async () => {
    const root = unique("c7");
    const source = `${root}/src/`;
    await putMany(client, bucket, numbered(source, 60));
    const journal = memoryJournal();
    const controller = new AbortController();
    const entry = entryFor(source, `${root}/dst/`);
    const first = await runOperation({ client, journal, entry, signal: controller.signal, onProgress: (progress) => { if (progress.done >= 10) controller.abort(); } });
    expect(first.status).toBe("interrupted");
    const result = await runOperation({ client, journal, entry: resume(first) });
    expect(result).toMatchObject({ status: "done", done: 60 });
    expect(await keys(source)).toEqual([]);
    expect((await keys(`${root}/dst/`)).length).toBe(60);
  }, 60_000);
});

describe("FR-34 exit check numbers", () => {
  it("moves a folder of 2,000 objects, interrupted mid-way and resumed, with nothing lost or duplicated", async () => {
    const root = unique("ex");
    const source = `${root}/src/`;
    const original = numbered(source, 2000);
    await putMany(client, bucket, original, 48);
    const journal = memoryJournal();
    const controller = new AbortController();
    const entry = entryFor(source, `${root}/dst/`);
    const first = await runOperation({ client, journal, entry, signal: controller.signal, onProgress: (progress) => { if (progress.done >= 700) controller.abort(); } });
    expect(first.status).toBe("interrupted");
    expect(first.done).toBeGreaterThanOrEqual(700);
    expect(first.done).toBeLessThan(2000);
    const result = await runOperation({ client, journal, entry: resume(first) });
    expect(result).toMatchObject({ status: "done", total: 2000, done: 2000 });
    const before = original.map((key) => key.replace("/src/", "/dst/"));
    expect(await keys(`${root}/dst/`)).toEqual(before);
    expect(await keys(source)).toEqual([]);
  }, 300_000);
});

