import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { s3Fixture } from "./config";

// Smoke test for the local S3 fixture: proves the SDK settings Coffer will use
// (path-style, WHEN_REQUIRED checksums) work end to end. Later milestones add
// the real operations tests next to this file.
const client = new S3Client({
  endpoint: s3Fixture.endpoint,
  region: s3Fixture.region,
  forcePathStyle: true,
  credentials: { accessKeyId: s3Fixture.accessKeyId, secretAccessKey: s3Fixture.secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const prefix = `smoke-${Date.now().toString(36)}/`;
const key = `${prefix}hello.txt`;

describe("S3 fixture smoke test", () => {
  beforeAll(async () => {
    try {
      await client.send(new CreateBucketCommand({ Bucket: s3Fixture.bucket }));
    } catch (error) {
      if (!(error instanceof Error) || !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)) {
        throw error;
      }
    }
  });

  afterAll(async () => {
    await client.send(new DeleteObjectCommand({ Bucket: s3Fixture.bucket, Key: key }));
    client.destroy();
  });

  it("lists the test bucket", async () => {
    const { Buckets } = await client.send(new ListBucketsCommand({}));
    expect(Buckets?.map((bucket) => bucket.Name)).toContain(s3Fixture.bucket);
  });

  it("puts, lists, gets and deletes an object", async () => {
    await client.send(new PutObjectCommand({ Bucket: s3Fixture.bucket, Key: key, Body: "hello coffer" }));

    const listing = await client.send(
      new ListObjectsV2Command({ Bucket: s3Fixture.bucket, Prefix: prefix, Delimiter: "/" }),
    );
    expect(listing.Contents?.map((object) => object.Key)).toEqual([key]);

    const object = await client.send(new GetObjectCommand({ Bucket: s3Fixture.bucket, Key: key }));
    expect(await object.Body?.transformToString()).toBe("hello coffer");

    await client.send(new DeleteObjectCommand({ Bucket: s3Fixture.bucket, Key: key }));
    const after = await client.send(new ListObjectsV2Command({ Bucket: s3Fixture.bucket, Prefix: prefix }));
    expect(after.KeyCount).toBe(0);
  });
});
