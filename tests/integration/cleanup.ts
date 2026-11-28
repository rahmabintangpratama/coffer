import { AbortMultipartUploadCommand, DeleteBucketCommand, DeleteObjectCommand, DeleteObjectsCommand, ListBucketsCommand, ListMultipartUploadsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import { decodeS3Key } from "../../src/lib/s3/keys";
import { s3Fixture } from "./config";

// Removing what tests leave in the S3 fixture, so a run never starts from the state of the one before it. Everything
// here deletes, so it only ever runs against a server on this machine, signed with the fixture's own key.

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const COMPOSE = "tests/integration/docker-compose.yml";

/** The access key the fixture is started with, read from the compose file so the two cannot drift apart. */
function composeAccessKey(): string {
  const compose = readFileSync(new URL("./docker-compose.yml", import.meta.url), "utf8");
  const key = /^\s*RUSTFS_ACCESS_KEY:\s*(\S+)\s*$/m.exec(compose)?.[1];
  if (key === undefined) throw new Error(`Refusing to delete test data: ${COMPOSE} names no RUSTFS_ACCESS_KEY.`);
  return key;
}

/**
 * Refuses unless the endpoint is on this machine (`COFFER_TEST_S3_ENDPOINT` can point the tests elsewhere) and the
 * configured access key is the fixture's: a server on a loopback address may still be a tunnel to real storage. The
 * configured key is never put in the message.
 */
export function assertTestFixture(endpoint: string = s3Fixture.endpoint, accessKeyId: string = s3Fixture.accessKeyId): void {
  const host = new URL(endpoint).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`Refusing to delete test data on ${host}: only a fixture on this machine is ever emptied.`);
  if (accessKeyId !== composeAccessKey()) throw new Error(`Refusing to delete test data: the configured access key is not the fixture key in ${COMPOSE}. Only the test fixture is ever emptied.`);
}

export async function listKeys(client: S3Client, bucket: string, prefix = ""): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, EncodingType: "url", ...(token === undefined ? {} : { ContinuationToken: token }) }));
    keys.push(...(page.Contents ?? []).map((object) => decodeS3Key(object.Key ?? "")));
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return keys;
}

async function deleteKeys(client: S3Client, bucket: string, keys: readonly string[]): Promise<void> {
  assertTestFixture();
  for (let start = 0; start < keys.length; start += 1000) {
    const batch = keys.slice(start, start + 1000);
    const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
    // A key the batch request cannot carry is deleted on its own; one that still fails stops the run.
    for (const failed of result.Errors ?? []) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: failed.Key }));
  }
}

async function abortUploads(client: S3Client, bucket: string, prefix = ""): Promise<void> {
  assertTestFixture();
  const open = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: prefix }));
  for (const upload of open.Uploads ?? []) await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: upload.Key, UploadId: upload.UploadId }));
}

/** Whether a trashed key (`{root}.coffer-trash/{batch}/{original key}`) came from under `prefix`, or lies under it. */
export function isTrashOf(key: string, prefix: string): boolean {
  const match = /(?:^|\/)\.coffer-trash\/[^/]+\/(.*)$/.exec(key);
  return match?.[1]?.startsWith(`${prefix}/`) ?? false;
}

/** One test's folder: its objects, its unfinished uploads and whatever it moved to the trash. */
export async function removePrefix(client: S3Client, bucket: string, prefix: string): Promise<void> {
  await abortUploads(client, bucket, `${prefix}/`);
  const own = await listKeys(client, bucket, `${prefix}/`);
  const trashed = (await listKeys(client, bucket, ".coffer-trash/")).filter((key) => isTrashOf(key, prefix));
  await deleteKeys(client, bucket, [...own, ...trashed]);
}

export async function emptyBucket(client: S3Client, bucket: string, prefix = ""): Promise<void> {
  await abortUploads(client, bucket, prefix);
  await deleteKeys(client, bucket, await listKeys(client, bucket, prefix));
}

export async function deleteBucket(client: S3Client, bucket: string): Promise<void> {
  await emptyBucket(client, bucket);
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));
}

export async function bucketNames(client: S3Client): Promise<string[]> {
  return ((await client.send(new ListBucketsCommand({}))).Buckets ?? []).map((bucket) => bucket.Name ?? "").filter((name) => name !== "");
}
