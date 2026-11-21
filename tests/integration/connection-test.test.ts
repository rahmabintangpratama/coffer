import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSdkClient, runConnectionTest, type ConnectionTestRun } from "@/lib/s3";
import { createBucket, createClient } from "./client";
import { admin, type Credentials, s3Fixture, testUsers } from "./config";

// The connection test (FR-5, FR-110) against the real S3 fixture, with the
// users and policies from global-setup.ts. A browser adds CORS, which is
// covered by the Playwright spec in tests/e2e.
const adminClient = createClient(admin);

const testClient = (credentials: Credentials, endpoint: string = s3Fixture.endpoint) =>
  createSdkClient({ endpoint, region: s3Fixture.region, forcePathStyle: true, credentials, maxAttempts: 1 });

const run = (credentials: Credentials, options: { bucket?: string; prefix?: string; endpoint?: string } = {}): Promise<ConnectionTestRun> =>
  runConnectionTest({
    client: testClient(credentials, options.endpoint),
    endpoint: options.endpoint ?? s3Fixture.endpoint,
    ...(options.bucket === undefined ? {} : { bucket: options.bucket }),
    ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
  });

const status = (result: ConnectionTestRun) => Object.fromEntries(result.steps.map((step) => [step.id, step.status]));
const failureOf = (result: ConnectionTestRun, id: string) => result.steps.find((step) => step.id === id)?.failure;

async function keysIn(client: S3Client, bucket: string): Promise<string[]> {
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
  return (listed.Contents ?? []).flatMap((object) => (object.Key === undefined ? [] : [object.Key]));
}

let bucket = "";
beforeAll(async () => {
  bucket = await createBucket(adminClient, "ct");
  await adminClient.send(new PutObjectCommand({ Bucket: bucket, Key: "existing.txt", Body: "hello" }));
});
afterAll(() => {
  adminClient.destroy();
});

describe("a working connection", () => {
  it("passes all six steps and leaves nothing behind", async () => {
    const result = await run(admin, { bucket });
    expect(result.outcome).toBe("ok");
    expect(status(result)).toEqual({ reach: "pass", cors: "pass", list: "pass", write: "pass", read: "pass", clean: "pass" });
    expect(await keysIn(adminClient, bucket)).toEqual(["existing.txt"]);
  });

  it("writes the test file under the start folder, and only there", async () => {
    const real = testClient(admin);
    const written: string[] = [];
    const spy = {
      send: (command: object, options?: object) => {
        const input = (command as { input?: { Key?: string } }).input;
        if (command.constructor.name === "PutObjectCommand" && input?.Key !== undefined) written.push(input.Key);
        return (real.send as (c: object, o?: object) => Promise<unknown>)(command, options);
      },
    } as unknown as S3Client;
    const result = await runConnectionTest({ client: spy, endpoint: s3Fixture.endpoint, bucket, prefix: "start/folder/" });
    expect(result.outcome).toBe("ok");
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/^start\/folder\/\.coffer-test-[0-9a-f]{16}\.txt$/);
    expect(await keysIn(adminClient, bucket)).toEqual(["existing.txt"]);
  });

  it("lists the buckets when none is given", async () => {
    const result = await run(admin);
    expect(result.outcome).toBe("ok");
    expect(result.buckets).toContain(bucket);
    expect(status(result)).toMatchObject({ list: "pass", write: "pending" });
  });

  it("never puts a secret in the result", async () => {
    const result = await run(admin, { bucket });
    expect(JSON.stringify(result)).not.toContain(admin.secretAccessKey);
    expect(JSON.stringify(result)).not.toContain(admin.accessKeyId);
  });
});

describe("a connection that fails", () => {
  it("reports a wrong secret as a signature problem at the list step", async () => {
    const result = await run({ accessKeyId: admin.accessKeyId, secretAccessKey: "not-the-secret" }, { bucket });
    expect(result.outcome).toBe("failed");
    expect(status(result)).toMatchObject({ reach: "pass", cors: "pass", list: "fail", write: "skipped" });
    expect(failureOf(result, "list")).toBe("signatureDoesNotMatch");
  });

  it("reports an unknown access key the same way", async () => {
    const result = await run({ accessKeyId: "no-such-key", secretAccessKey: "whatever-secret" }, { bucket });
    expect(failureOf(result, "list")).toBe("signatureDoesNotMatch");
  });

  it("reports a bucket that does not exist", async () => {
    const result = await run(admin, { bucket: `missing-${Date.now().toString(36)}` });
    expect(result.outcome).toBe("failed");
    expect(failureOf(result, "list")).toBe("noSuchBucket");
  });

  it("reports an endpoint that nothing answers on as a network problem", async () => {
    const result = await run(admin, { bucket, endpoint: "http://127.0.0.1:1" });
    expect(result.outcome).toBe("failed");
    expect(status(result)).toMatchObject({ reach: "fail", cors: "skipped" });
    expect(failureOf(result, "reach")).toBe("network");
  });
});

describe("read-only keys (FR-110)", () => {
  it("is offered read-only, with the read proven on an existing object", async () => {
    const result = await run(testUsers.readOnly, { bucket });
    expect(result.outcome).toBe("readOnly");
    expect(result.readVerified).toBe(true);
    expect(status(result)).toMatchObject({ list: "pass", write: "fail", read: "skipped", clean: "skipped" });
    expect(failureOf(result, "write")).toBe("accessDenied");
  });

  it("is still offered read-only for an empty bucket, with the read unverified", async () => {
    const empty = await createBucket(adminClient, "empty");
    const result = await run(testUsers.readOnly, { bucket: empty });
    expect(result.outcome).toBe("readOnly");
    expect(result.readVerified).toBe(false);
  });
});

describe("a key that can write but not delete (C-20)", () => {
  it("fails on the clean step", async () => {
    const own = await createBucket(adminClient, "nodelete");
    const result = await run(testUsers.noDelete, { bucket: own });
    expect(result.outcome).toBe("failed");
    expect(status(result)).toMatchObject({ write: "pass", read: "pass", clean: "fail" });
    expect(failureOf(result, "clean")).toBe("accessDenied");
    // The test file stays because the key cannot delete it; remove it as the admin.
    const left = await keysIn(adminClient, own);
    expect(left).toHaveLength(1);
    for (const key of left) await adminClient.send(new DeleteObjectCommand({ Bucket: own, Key: key }));
  });
});
