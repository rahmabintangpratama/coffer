import { createHash, randomBytes } from "node:crypto";
import {
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  UploadPartCommand,
  UploadPartCopyCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { beforeAll, describe, expect, it } from "vitest";
import { createBucket, createClient } from "./client";
import { admin, s3Fixture, testUsers } from "./config";

// What Coffer needs from an S3 server, checked against the local fixture. If
// the fixture is ever swapped for another server, this file is the acceptance
// test (docs/open-questions.md, C-48).
const client = createClient(admin);
const ORIGIN = "http://localhost:5173";
const OTHER_ORIGIN = "https://other.example";
const MiB = 1024 * 1024;
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

let bucket = "";
let bareBucket = "";

beforeAll(async () => {
  bucket = await createBucket(client, "cap");
  bareBucket = await createBucket(client, "bare");
});

async function preflight(inBucket: string, origin: string) {
  const response = await fetch(`${s3Fixture.endpoint}/${inBucket}/object`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "authorization,x-amz-content-sha256,x-amz-date,x-amz-user-agent",
    },
  });
  return {
    status: response.status,
    allowOrigin: response.headers.get("access-control-allow-origin"),
    allowMethods: response.headers.get("access-control-allow-methods") ?? "",
  };
}

describe("CORS per bucket", () => {
  it("stores a rule with PutBucketCors and returns it", async () => {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [ORIGIN],
              AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag", "Date", "x-amz-bucket-region"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    const { CORSRules } = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    expect(CORSRules?.[0]?.AllowedOrigins).toEqual([ORIGIN]);
  });

  it("answers a preflight for the allowed origin", async () => {
    const result = await preflight(bucket, ORIGIN);
    expect(result.allowOrigin).toBe(ORIGIN);
    expect(result.allowMethods).toContain("PUT");
  });

  it("does not allow another origin", async () => {
    expect((await preflight(bucket, OTHER_ORIGIN)).allowOrigin).toBeNull();
  });

  it("does not allow any origin on a bucket without a rule (the CORS-failure case)", async () => {
    expect((await preflight(bareBucket, ORIGIN)).allowOrigin).toBeNull();
  });

  it("sends allow-origin and exposes ETag on a real request", async () => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: "cors.txt", Body: "x" }));
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: "cors.txt" }), {
      expiresIn: 60,
    });
    const response = await fetch(url, { headers: { Origin: ORIGIN } });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-expose-headers")?.toLowerCase()).toContain("etag");
  });
});

describe("multipart upload and UploadPartCopy", () => {
  const part1 = randomBytes(5 * MiB);
  const part2 = randomBytes(1000);

  it("completes a two-part upload", async () => {
    const { UploadId } = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: "mp.bin" }));
    const first = await client.send(
      new UploadPartCommand({ Bucket: bucket, Key: "mp.bin", UploadId, PartNumber: 1, Body: part1 }),
    );
    const second = await client.send(
      new UploadPartCommand({ Bucket: bucket, Key: "mp.bin", UploadId, PartNumber: 2, Body: part2 }),
    );
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: "mp.bin",
        UploadId,
        MultipartUpload: {
          Parts: [
            { PartNumber: 1, ETag: first.ETag },
            { PartNumber: 2, ETag: second.ETag },
          ],
        },
      }),
    );
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "mp.bin" }));
    expect(head.ContentLength).toBe(part1.length + part2.length);
  });

  it("copies it with ranged UploadPartCopy and keeps the content", async () => {
    const { UploadId } = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: "mp-copy.bin" }));
    const first = await client.send(
      new UploadPartCopyCommand({
        Bucket: bucket,
        Key: "mp-copy.bin",
        UploadId,
        PartNumber: 1,
        CopySource: `${bucket}/mp.bin`,
        CopySourceRange: `bytes=0-${part1.length - 1}`,
      }),
    );
    const second = await client.send(
      new UploadPartCopyCommand({
        Bucket: bucket,
        Key: "mp-copy.bin",
        UploadId,
        PartNumber: 2,
        CopySource: `${bucket}/mp.bin`,
        CopySourceRange: `bytes=${part1.length}-${part1.length + part2.length - 1}`,
      }),
    );
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: "mp-copy.bin",
        UploadId,
        MultipartUpload: {
          Parts: [
            { PartNumber: 1, ETag: first.CopyPartResult?.ETag },
            { PartNumber: 2, ETag: second.CopyPartResult?.ETag },
          ],
        },
      }),
    );
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: "mp-copy.bin" }));
    const body = Buffer.from((await object.Body?.transformToByteArray()) ?? []);
    expect(sha256(body)).toBe(sha256(Buffer.concat([part1, part2])));
  });
});

describe("listing", () => {
  it("lists with a delimiter and EncodingType=url", async () => {
    const keys = ["a b/c+d.txt", "é/日本.txt", "x#y?.txt", "dir/one.txt", "dir/two.txt", "top.txt"];
    for (const key of keys) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: `l/${key}`, Body: "1" }));
    }
    const result = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: "l/", Delimiter: "/", EncodingType: "url" }),
    );
    const prefixes = (result.CommonPrefixes ?? []).map((item) => item.Prefix ?? "");
    const contents = (result.Contents ?? []).map((item) => item.Key ?? "");
    expect(result.EncodingType).toBe("url");
    // The server must have encoded the awkward characters, and decoding must give the originals back.
    expect([...prefixes, ...contents].some((value) => value.includes("%"))).toBe(true);
    const decoded = [...prefixes, ...contents].map((value) => decodeURIComponent(value.replaceAll("+", "%20")));
    expect(decoded).toEqual(expect.arrayContaining(["l/a b/", "l/é/", "l/dir/", "l/x#y?.txt", "l/top.txt"]));
  });
});

describe("presigned GET", () => {
  it("downloads with a response-content-disposition override", async () => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: "p.txt", Body: "presigned" }));
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: "p.txt", ResponseContentDisposition: 'attachment; filename="p.txt"' }),
      { expiresIn: 60 },
    );
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("presigned");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });

  it("stops working after it expires", async () => {
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: "p.txt" }), { expiresIn: 1 });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect((await fetch(url)).status).toBe(403);
  });
});

describe("DeleteObjects and CopyObject", () => {
  it("deletes several keys in one request", async () => {
    const keys = ["d1", "d2", "d3"];
    for (const key of keys) await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "z" }));
    const result = await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false } }),
    );
    expect(result.Deleted).toHaveLength(3);
  });

  it("copies an object and keeps its content type", async () => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: "src.json", Body: "{}", ContentType: "application/json" }));
    await client.send(new CopyObjectCommand({ Bucket: bucket, Key: "dst.json", CopySource: `${bucket}/src.json` }));
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: "dst.json" }));
    expect(head.ContentType).toBe("application/json");
  });
});

describe("per-user policies", () => {
  const readOnly = createClient(testUsers.readOnly);
  const noDelete = createClient(testUsers.noDelete);

  beforeAll(async () => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: "policy-seed.txt", Body: "seed" }));
  });

  it("read-only user can list and read but not write or delete", async () => {
    await expect(readOnly.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "policy-" }))).resolves.toBeDefined();
    await expect(readOnly.send(new GetObjectCommand({ Bucket: bucket, Key: "policy-seed.txt" }))).resolves.toBeDefined();
    await expect(
      readOnly.send(new PutObjectCommand({ Bucket: bucket, Key: "ro.txt", Body: "x" })),
    ).rejects.toMatchObject({ name: "AccessDenied" });
    await expect(
      readOnly.send(new DeleteObjectCommand({ Bucket: bucket, Key: "policy-seed.txt" })),
    ).rejects.toMatchObject({ name: "AccessDenied" });
  });

  it("delete-denied user can write and read but not delete", async () => {
    await expect(
      noDelete.send(new PutObjectCommand({ Bucket: bucket, Key: "nd.txt", Body: "x" })),
    ).resolves.toBeDefined();
    await expect(noDelete.send(new GetObjectCommand({ Bucket: bucket, Key: "nd.txt" }))).resolves.toBeDefined();
    await expect(
      noDelete.send(new DeleteObjectCommand({ Bucket: bucket, Key: "nd.txt" })),
    ).rejects.toMatchObject({ name: "AccessDenied" });
  });
});
