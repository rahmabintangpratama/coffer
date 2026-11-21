import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBucket, createClient } from "./client";
import { admin } from "./config";

// Smoke test for the local S3 fixture: proves the SDK settings Coffer will use
// (path-style, WHEN_REQUIRED checksums) work end to end.
const client = createClient(admin);
let bucket = "";
const prefix = `smoke-${Date.now().toString(36)}/`;
const key = `${prefix}hello.txt`;

describe("S3 fixture smoke test", () => {
  beforeAll(async () => {
    bucket = await createBucket(client, "smoke");
  });

  afterAll(async () => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    client.destroy();
  });

  it("lists the bucket it created", async () => {
    const { Buckets } = await client.send(new ListBucketsCommand({}));
    expect(Buckets?.map((item) => item.Name)).toContain(bucket);
  });

  it("puts, lists, gets and deletes an object", async () => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "hello coffer" }));

    const listing = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/" }));
    expect(listing.Contents?.map((object) => object.Key)).toEqual([key]);

    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    expect(await object.Body?.transformToString()).toBe("hello coffer");

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    const after = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    expect(after.KeyCount).toBe(0);
  });
});
