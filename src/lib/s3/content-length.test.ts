// @vitest-environment node
import { Readable } from "node:stream";
import { type S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "./client";
import { putFolder } from "./conflicts";
import { runConnectionTest } from "./connection-test";
import { RequestPool } from "./pool";
import { uploadObject } from "./upload";

interface Seen { method: string; path: string; query: string; headers: Record<string, string> }

/** A real S3 client over a fake transport: it records the requests the SDK really builds and answers 200. */
function recording(): { client: S3Client; seen: Seen[] } {
  const seen: Seen[] = [];
  const client = createClient({ endpoint: "http://127.0.0.1:9", region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "k", secretAccessKey: "s" }, maxAttempts: 1 });
  client.config.requestHandler = {
    handle: (request: { method: string; path: string; query?: Record<string, unknown>; headers: Record<string, string> }) => {
      seen.push({ method: request.method, path: request.path, query: JSON.stringify(request.query ?? {}), headers: { ...request.headers } });
      const query = request.query ?? {};
      const body =
        request.method !== "POST"
          ? ""
          : "uploads" in query
            ? "<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>"
            : "<CompleteMultipartUploadResult><Key>big</Key></CompleteMultipartUploadResult>";
      return Promise.resolve({ response: { statusCode: 200, headers: { etag: '"e"' }, body: Readable.from([body]) } });
    },
    destroy: () => undefined,
  } as never;
  return { client, seen };
}

const memoryStore = { put: () => Promise.resolve(), addPart: () => Promise.resolve(), delete: () => Promise.resolve() };
const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "text/plain" });
const lengthOf = (seen: Seen) => Object.entries(seen.headers).find(([name]) => name.toLowerCase() === "content-length")?.[1];

describe("every PutObject carries Content-Length (many providers reject it otherwise)", () => {
  it("a small upload", async () => {
    const { client, seen } = recording();
    await uploadObject({ client, bucket: "b", key: "a.txt", body: blob(1234), pool: new RequestPool(() => 4), store: memoryStore, connection: { id: "c", endpoint: "http://x" } });
    expect(seen.map((entry) => entry.method)).toEqual(["PUT"]);
    expect(lengthOf(seen[0]!)).toBe("1234");
  });

  it("an empty file", async () => {
    const { client, seen } = recording();
    await uploadObject({ client, bucket: "b", key: "empty", body: blob(0), pool: new RequestPool(() => 4), store: memoryStore, connection: { id: "c", endpoint: "http://x" } });
    expect(lengthOf(seen[0]!)).toBe("0");
  });

  it("a new folder placeholder", async () => {
    const { client, seen } = recording();
    await putFolder(client, { bucket: "b", key: "dir/" });
    expect(lengthOf(seen[0]!)).toBe("0");
  });

  it("every part of a multipart upload", async () => {
    const { client, seen } = recording();
    await uploadObject({ client, bucket: "b", key: "big", body: blob(20 * 1024 * 1024), pool: new RequestPool(() => 4), store: memoryStore, connection: { id: "c", endpoint: "http://x" } });
    const parts = seen.filter((entry) => entry.method === "PUT");
    expect(parts).toHaveLength(3);
    expect(parts.map(lengthOf).sort()).toEqual([String(4 * 1024 * 1024), String(8 * 1024 * 1024), String(8 * 1024 * 1024)].sort());
  });

  it("the connection test's write step", async () => {
    const { client, seen } = recording();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await runConnectionTest({ client, endpoint: "http://127.0.0.1:9", bucket: "b", prefix: "", randomHex: () => "0123456789abcdef" }).catch(() => undefined);
    const write = seen.find((entry) => entry.method === "PUT");
    expect(write && lengthOf(write)).toBe("23");
  });
});
