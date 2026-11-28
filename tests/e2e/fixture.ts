import { CreateBucketCommand, ListObjectsV2Command, PutBucketCorsCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { assertTestFixture, bucketNames, deleteBucket, emptyBucket } from "../integration/cleanup";
import { createBucket, createClient } from "../integration/client";
import { admin } from "../integration/config";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { provisionTestUsers } from "../integration/provision";
import { putMany } from "../integration/seed";

/** The origin the e2e server (scripts/serve/dist-server.ts) listens on. Buckets allow it in their CORS rule. */
export const APP_ORIGIN = "http://127.0.0.1:4173";
/** A bucket whose CORS rule allows the app origin, with one object in it. */
export const E2E_BUCKET = "coffer-e2e-app";

export function corsFor(origin: string) {
  return {
    CORSRules: [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag", "Date", "x-amz-bucket-region"],
        MaxAgeSeconds: 3600,
      },
    ],
  };
}

export async function allowOrigin(client: S3Client, bucket: string, origin: string = APP_ORIGIN): Promise<void> {
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: corsFor(origin) }));
}

/** A new bucket with no CORS rule. */
export const bareBucket = (client: S3Client): Promise<string> => createBucket(client, "e2e-bare");

/**
 * The start of a run: nothing an earlier run left is kept. The shared bucket is emptied, every other bucket is deleted,
 * and the big read-only bucket keeps its seed, which takes long to write, without any trash.
 */
export async function resetFixture(): Promise<void> {
  assertTestFixture();
  const client = createClient(admin);
  try {
    for (const bucket of await bucketNames(client)) {
      if (bucket === E2E_BUCKET) await emptyBucket(client, bucket);
      else if (bucket === BIG_BUCKET) await emptyBucket(client, bucket, ".coffer-trash/");
      else await deleteBucket(client, bucket);
    }
  } finally {
    client.destroy();
  }
}

/** Creates the shared e2e bucket and the users (idempotent). */
export async function provisionE2e(): Promise<void> {
  await provisionTestUsers();
  const client = createClient(admin);
  try {
    await client.send(new CreateBucketCommand({ Bucket: E2E_BUCKET }));
  } catch {
    // It exists from an earlier run.
  }
  await allowOrigin(client, E2E_BUCKET);
  await client.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: "hello.txt", Body: "hello" }));
  await seedPreviewFixtures(client);
}

/** The files the preview specs open, under `preview/` in the shared bucket (FR-50 to FR-58). */
async function seedPreviewFixtures(client: S3Client): Promise<void> {
  const dir = fileURLToPath(new URL("../fixtures/preview/", import.meta.url));
  for (const name of readdirSync(dir)) {
    // No content type on purpose: providers store plain uploads as octet-stream, and Coffer must cope.
    await client.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `preview/${name}`, Body: readFileSync(`${dir}${name}`) }));
  }
  // Over the 1 MiB text limit, so the truncation notice shows.
  const line = "line of text that repeats to make a file larger than the preview limit\n";
  await client.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: "preview/big.txt", Body: line.repeat(Math.ceil((1.5 * 1024 * 1024) / line.length)) }));
}

/** A bucket for browsing at scale (FR-20, FR-21): 5,000 files at the root, ten folders of 500, and one folder of exactly 2,000. */
export const BIG_BUCKET = "coffer-e2e-big";
const pad = (n: number) => n.toString().padStart(5, "0");

export async function provisionBig(): Promise<void> {
  const client = createClient(admin);
  try {
    try {
      await client.send(new CreateBucketCommand({ Bucket: BIG_BUCKET }));
    } catch {
      // It exists from an earlier run.
    }
    await allowOrigin(client, BIG_BUCKET);
    const probe = await client.send(new ListObjectsV2Command({ Bucket: BIG_BUCKET, Prefix: "exact/", MaxKeys: 1 }));
    if ((probe.KeyCount ?? 0) > 0) return;
    const keys = [
      ...Array.from({ length: 5000 }, (_, n) => `f-${pad(n)}.txt`),
      ...Array.from({ length: 10 }, (_, d) => Array.from({ length: 500 }, (_, n) => `folder-${d.toString()}/g-${pad(n)}.txt`)).flat(),
      ...Array.from({ length: 2000 }, (_, n) => `exact/e-${pad(n)}.txt`),
      ...["#hash.txt", "q?mark.txt", "100%.txt", "plus+sign.txt", "日本語.txt"].map((name) => `awkward/${name}`),
    ];
    await putMany(client, BIG_BUCKET, keys, 48);
    await client.send(new PutObjectCommand({ Bucket: BIG_BUCKET, Key: "awkward/hello.txt", Body: "hello download" }));
  } finally {
    client.destroy();
  }
}
