import type { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listPage, type ListPage } from "@/lib/s3/list";
import { MAX_KEY_BYTES } from "@/lib/s3/keys";
import { createBucket, createClient } from "./client";
import { admin } from "./config";
import { putMany } from "./seed";

// FR-20, FR-21: the listing against a real server: delimiter, pagination in
// pages of 1,000, and keys that need URL encoding to survive XML.
const client: S3Client = createClient(admin);
let bucket = "";

const pad = (n: number) => n.toString().padStart(5, "0");
// The server limits one path segment to 255 bytes, so the 1,024-byte key is built from several.
const longPrefix = `long/${`${"x".repeat(200)}/`.repeat(4)}`;
const longKey = `${longPrefix}${"y".repeat(MAX_KEY_BYTES - longPrefix.length)}`;
const awkward = ["#hash.txt", "q?mark.txt", "100%.txt", "plus+sign.txt", "  spaced name .txt", "日本語.txt", "emoji 📁.txt"];

async function all(prefix: string): Promise<ListPage[]> {
  const pages: ListPage[] = [];
  let token: string | undefined;
  do {
    const page = await listPage(client, { bucket, prefix, root: "", ...(token === undefined ? {} : { token }) });
    pages.push(page);
    token = page.nextToken;
  } while (token !== undefined);
  return pages;
}

describe("listing (FR-20, FR-21)", () => {
  beforeAll(async () => {
    bucket = await createBucket(client, "list");
    const files = Array.from({ length: 5000 }, (_, n) => `big/f-${pad(n)}.txt`);
    const folders = Array.from({ length: 12 }, (_, n) => `big/dir-${pad(n)}/inner.txt`);
    await putMany(client, bucket, [
      ...files,
      ...folders,
      ...awkward.map((name) => `awk/${name}`),
      "awk/empty-folder/",
      longKey,
      "root.txt",
      ".trash/old/x.txt",
    ]);
  }, 120_000);

  afterAll(() => { client.destroy(); });

  it("AC-21.1 pages 5,000 files and 12 folders in pages of at most 1,000, folders reported once", async () => {
    const pages = await all("big/");
    expect(pages.every((page) => page.count <= 1000)).toBe(true);
    expect(pages.length).toBeGreaterThanOrEqual(6);
    const files = pages.flatMap((page) => page.files);
    expect(files).toHaveLength(5000);
    expect(new Set(files.map((file) => file.key)).size).toBe(5000);
    expect(pages.flatMap((page) => page.folders)).toHaveLength(12);
    expect(pages.at(-1)?.nextToken).toBeUndefined();
  });

  it("AC-20.6 round-trips awkward names through URL encoding", async () => {
    const [page] = await all("awk/");
    expect(page?.files.map((file) => file.name).sort()).toEqual([...awkward].sort());
    expect(page?.folders.map((folder) => folder.name)).toEqual(["empty-folder"]);
  });

  it("returns a 1,024-byte key intact", async () => {
    const [page] = await all(longPrefix);
    expect(page?.files[0]?.key).toBe(longKey);
    expect(new TextEncoder().encode(longKey).length).toBe(MAX_KEY_BYTES);
  });

  it("skips a folder placeholder when listing inside it", async () => {
    const [page] = await all("awk/empty-folder/");
    expect(page?.files).toEqual([]);
    expect(page?.folders).toEqual([]);
  });

  it("lists the root with its folders and hides the trash prefix", async () => {
    const [page] = await all("");
    expect(page?.folders.map((folder) => folder.name).sort()).toEqual(["awk", "big", "long"]);
    expect(page?.files.map((file) => file.name)).toEqual(["root.txt"]);
  });
});
