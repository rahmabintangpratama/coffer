// @vitest-environment node
import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import type { ConnectionTestStep } from "@/lib/types";
import { type ConnectionTestRun, runConnectionTest } from "./connection-test";

type Handler = (input: Record<string, unknown>) => unknown;

function fake(handlers: Partial<Record<string, Handler>>) {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const client = {
    send: (command: { constructor: { name: string }; input: Record<string, unknown> }) =>
      new Promise((resolve, reject) => {
        const name = command.constructor.name;
        calls.push({ name, input: command.input });
        const handler = handlers[name];
        if (!handler) {
          reject(new Error(`unexpected command ${name}`));
          return;
        }
        try {
          resolve(handler(command.input));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
  } as unknown as S3Client;
  return { client, calls };
}

const service = (name: string, status: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status }, ...extra });
const body = (text: string) => ({ Body: { transformToString: () => Promise.resolve(text) } });
const TEXT = "coffer connection test\n";

const ok: Record<string, Handler> = {
  ListObjectsV2Command: () => ({ Contents: [{ Key: "existing.txt" }] }),
  PutObjectCommand: () => ({}),
  GetObjectCommand: () => body(TEXT),
  DeleteObjectCommand: () => ({}),
};

const base = { endpoint: "https://s3.example.com", bucket: "data", pageProtocol: "https:", reach: () => Promise.resolve(), randomHex: () => "0123456789abcdef" };
const statuses = (run: ConnectionTestRun) => Object.fromEntries(run.steps.map((step) => [step.id, step.status]));

describe("a passing connection", () => {
  it("runs the six steps in order and ends ok", async () => {
    const { client, calls } = fake(ok);
    const events: ConnectionTestStep[] = [];
    const run = await runConnectionTest({ ...base, client, onStep: (step) => events.push(step) });
    expect(run.outcome).toBe("ok");
    expect(statuses(run)).toEqual({ reach: "pass", cors: "pass", list: "pass", write: "pass", read: "pass", clean: "pass" });
    expect(calls.map((call) => call.name)).toEqual(["ListObjectsV2Command", "PutObjectCommand", "GetObjectCommand", "DeleteObjectCommand"]);
    // each step is reported running, then passed
    expect(events.filter((event) => event.id === "write").map((event) => event.status)).toEqual(["running", "pass"]);
    expect(run.steps.every((step) => typeof step.ms === "number")).toBe(true);
  });

  it("writes the test file in the bucket root with a random name and deletes that same key", async () => {
    const { client, calls } = fake(ok);
    await runConnectionTest({ ...base, client });
    const put = calls.find((call) => call.name === "PutObjectCommand")?.input;
    const del = calls.find((call) => call.name === "DeleteObjectCommand")?.input;
    expect(put?.Key).toBe(".coffer-test-0123456789abcdef.txt");
    expect(del?.Key).toBe(put?.Key);
  });

  it("writes under the start folder when one is set, and lists inside it", async () => {
    const { client, calls } = fake(ok);
    await runConnectionTest({ ...base, client, prefix: "exports/2026/" });
    expect(calls.find((call) => call.name === "PutObjectCommand")?.input.Key).toBe("exports/2026/.coffer-test-0123456789abcdef.txt");
    expect(calls.find((call) => call.name === "ListObjectsV2Command")?.input).toMatchObject({ Prefix: "exports/2026/", MaxKeys: 1 });
  });
});

describe("failures before the signed call", () => {
  it("fails with mixedContent, without any request, for http on an https page", async () => {
    const { client, calls } = fake(ok);
    const run = await runConnectionTest({ ...base, client, endpoint: "http://s3.example.com", pageProtocol: "https:" });
    expect(run.outcome).toBe("failed");
    expect(run.steps[0]).toMatchObject({ id: "reach", status: "fail", failure: "mixedContent" });
    expect(statuses(run).cors).toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("fails with mixedContent for http on a private address too, since only loopback is exempt", async () => {
    const { client, calls } = fake(ok);
    const run = await runConnectionTest({ ...base, client, endpoint: "http://192.168.2.120:9000", pageProtocol: "https:" });
    expect(run.steps[0]).toMatchObject({ status: "fail", failure: "mixedContent" });
    expect(calls).toEqual([]);
  });

  it("allows http for localhost on an https page", async () => {
    const { client } = fake(ok);
    const run = await runConnectionTest({ ...base, client, endpoint: "http://localhost:9000" });
    expect(run.outcome).toBe("ok");
  });

  it("fails at reach as a network problem when nothing answers, after one retry", async () => {
    const { client, calls } = fake(ok);
    let attempts = 0;
    const run = await runConnectionTest({
      ...base,
      client,
      reach: () => {
        attempts += 1;
        return Promise.reject(new TypeError("Failed to fetch"));
      },
    });
    expect(run.steps[0]).toMatchObject({ id: "reach", status: "fail", failure: "network" });
    expect(statuses(run)).toMatchObject({ cors: "skipped", list: "skipped", write: "skipped" });
    expect(attempts).toBe(2);
    expect(calls).toEqual([]);
  });
});

describe("a local endpoint that cannot be reached", () => {
  const dead = (permission: "granted" | "prompt" | "denied" | "unsupported", endpoint = "http://localhost:9000") => {
    const { client, calls } = fake(ok);
    const asked: string[] = [];
    return {
      calls,
      asked,
      run: runConnectionTest({
        ...base,
        client,
        endpoint,
        reach: () => Promise.reject(new TypeError("Failed to fetch")),
        queryPermission: (name) => {
          asked.push(name);
          return Promise.resolve(permission);
        },
      }),
    };
  };

  it("is localNetworkDenied when the browser denied local network access", async () => {
    const { run, asked } = dead("denied");
    const result = await run;
    expect(result.steps[0]).toMatchObject({ id: "reach", status: "fail", failure: "localNetworkDenied" });
    expect(asked[0]).toBe("loopback-network");
  });

  it("asks for the local-network name for a private address", async () => {
    const { run, asked } = dead("denied", "https://192.168.2.120:9000");
    expect((await run).steps[0]?.failure).toBe("localNetworkDenied");
    expect(asked[0]).toBe("local-network");
  });

  it("is localNetworkDenied when the prompt was dismissed, because access is still not allowed", async () => {
    const { run } = dead("prompt");
    expect((await run).steps[0]?.failure).toBe("localNetworkDenied");
  });

  it.each(["granted", "unsupported"] as const)("stays a network problem when the permission is %s", async (permission) => {
    const { run } = dead(permission);
    expect((await run).steps[0]?.failure).toBe("network");
  });

  it("stays a network problem when the page itself is on localhost, where no permission is needed", async () => {
    const { client } = fake(ok);
    const result = await runConnectionTest({
      ...base,
      client,
      endpoint: "http://127.0.0.1:9000",
      pageHostname: "localhost",
      reach: () => Promise.reject(new TypeError("Failed to fetch")),
      queryPermission: () => Promise.resolve("prompt"),
    });
    expect(result.steps[0]?.failure).toBe("network");
  });

  it("never asks about a public address", async () => {
    const { run, asked } = dead("denied", "https://s3.example.com");
    expect((await run).steps[0]?.failure).toBe("network");
    expect(asked).toEqual([]);
  });
});

describe("telling CORS from other failures", () => {
  it("reports cors when the host answered but the signed request got no response", async () => {
    const { client } = fake({ ListObjectsV2Command: () => Promise.reject(new TypeError("Failed to fetch")) });
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("failed");
    expect(statuses(run)).toMatchObject({ reach: "pass", cors: "fail", list: "skipped", write: "skipped" });
    expect(run.steps[1]?.failure).toBe("cors");
  });

  it("treats a service error as proof that CORS works", async () => {
    const { client } = fake({ ListObjectsV2Command: () => Promise.reject(service("AccessDenied", 403)) });
    const run = await runConnectionTest({ ...base, client });
    expect(statuses(run)).toMatchObject({ cors: "pass", list: "fail" });
    expect(run.steps[2]?.failure).toBe("accessDenied");
  });
});

describe("failures at the list step", () => {
  const listFails = (error: Error) => fake({ ListObjectsV2Command: () => Promise.reject(error) });

  it.each([
    [service("SignatureDoesNotMatch", 403), "signatureDoesNotMatch"],
    [service("InvalidAccessKeyId", 403), "signatureDoesNotMatch"],
    [service("ExpiredToken", 400), "signatureDoesNotMatch"],
    [service("NoSuchBucket", 404), "noSuchBucket"],
    [service("AccessDenied", 403), "accessDenied"],
    [service("Strange", 418), "unknown"],
  ])("maps %s to %s", async (error, failure) => {
    const { client } = listFails(error);
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("failed");
    expect(run.steps[2]).toMatchObject({ id: "list", status: "fail", failure });
    expect(statuses(run)).toMatchObject({ write: "skipped", read: "skipped", clean: "skipped" });
  });

  it("offers the right region when the bucket is somewhere else", async () => {
    const { client } = listFails(service("AuthorizationHeaderMalformed", 400, { Region: "eu-west-1" }));
    const run = await runConnectionTest({ ...base, client });
    expect(run.steps[2]).toMatchObject({ failure: "wrongRegion", hint: { suggestedRegion: "eu-west-1" } });
  });

  it("offers the region from a redirect's bucket-region header", async () => {
    const { client } = listFails(service("PermanentRedirect", 301, { $response: { headers: { "x-amz-bucket-region": "ap-southeast-2" } } }));
    const run = await runConnectionTest({ ...base, client });
    expect(run.steps[2]).toMatchObject({ failure: "wrongRegion", hint: { suggestedRegion: "ap-southeast-2" } });
  });

  it("reports how far the device clock is off", async () => {
    const { client } = listFails(
      service("RequestTimeTooSkewed", 403, { RequestTime: "2026-11-21T12:00:00Z", ServerTime: "2026-11-21T12:17:00Z" }),
    );
    const run = await runConnectionTest({ ...base, client });
    expect(run.steps[2]).toMatchObject({ failure: "signatureDoesNotMatch", hint: { clockOffsetMinutes: 17 } });
  });
});

describe("without a bucket", () => {
  it("lists the buckets with ListBuckets and stops after the third step", async () => {
    const { client, calls } = fake({ ListBucketsCommand: () => ({ Buckets: [{ Name: "a" }, { Name: "b" }] }) });
    const run = await runConnectionTest({ ...base, client, bucket: undefined });
    expect(run.outcome).toBe("ok");
    expect(run.buckets).toEqual(["a", "b"]);
    expect(statuses(run)).toMatchObject({ list: "pass", write: "pending", read: "pending", clean: "pending" });
    expect(calls.map((call) => call.name)).toEqual(["ListBucketsCommand"]);
  });

  it("carries on when the key may not list buckets, so the person can type one", async () => {
    const { client } = fake({ ListBucketsCommand: () => Promise.reject(service("AccessDenied", 403)) });
    const run = await runConnectionTest({ ...base, client, bucket: undefined });
    expect(run.outcome).toBe("ok");
    expect(run.buckets).toBeUndefined();
    expect(statuses(run).list).toBe("pass");
  });
});

describe("a key that cannot write", () => {
  const denied = { ...ok, PutObjectCommand: () => Promise.reject(service("AccessDenied", 403)) };

  it("is offered read-only once a read of an existing object works", async () => {
    const { client, calls } = fake(denied);
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("readOnly");
    expect(run.readVerified).toBe(true);
    expect(statuses(run)).toMatchObject({ list: "pass", write: "fail", read: "skipped", clean: "skipped" });
    expect(run.steps[3]?.failure).toBe("accessDenied");
    const read = calls.find((call) => call.name === "GetObjectCommand");
    expect(read?.input).toMatchObject({ Key: "existing.txt", Range: "bytes=0-0" });
    expect(calls.some((call) => call.name === "DeleteObjectCommand")).toBe(false);
  });

  it("is still offered read-only for an empty bucket, with the read marked unverified", async () => {
    const { client } = fake({ ...denied, ListObjectsV2Command: () => ({ Contents: [] }) });
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("readOnly");
    expect(run.readVerified).toBe(false);
  });

  it("AC-110.3 an object that is gone before it is read leaves reading unverified, not failed", async () => {
    // Another session's test file is listed first and deleted before the read.
    const { client } = fake({
      ...ok,
      ListObjectsV2Command: () => ({ Contents: [{ Key: ".coffer-test-ffffffffffffffff.txt" }] }),
      PutObjectCommand: () => { throw service("AccessDenied", 403); },
      GetObjectCommand: () => { throw service("NoSuchKey", 404); },
    });
    const run = await runConnectionTest({ ...base, client });
    expect(run).toMatchObject({ outcome: "readOnly", readVerified: false });
    expect(statuses(run).read).toBe("skipped");
  });

  it("fails when even the read is denied", async () => {
    const { client } = fake({ ...denied, GetObjectCommand: () => Promise.reject(service("AccessDenied", 403)) });
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("failed");
    expect(run.steps[4]).toMatchObject({ id: "read", status: "fail", failure: "accessDenied" });
  });

  it("fails, not read-only, when the write fails for another reason", async () => {
    const { client } = fake({ ...ok, PutObjectCommand: () => Promise.reject(service("NoSuchBucket", 404)) });
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("failed");
    expect(run.steps[3]?.failure).toBe("noSuchBucket");
  });
});

describe("a key that can write but not delete", () => {
  it("fails on the clean step (it would fail rename, move and trash later)", async () => {
    const { client } = fake({ ...ok, DeleteObjectCommand: () => Promise.reject(service("AccessDenied", 403)) });
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("failed");
    expect(statuses(run)).toMatchObject({ write: "pass", read: "pass", clean: "fail" });
    expect(run.steps[5]?.failure).toBe("accessDenied");
  });
});

describe("read back", () => {
  it("fails when the content does not match what was written", async () => {
    const { client } = fake({ ...ok, GetObjectCommand: () => body("something else") });
    const run = await runConnectionTest({ ...base, client });
    expect(run.outcome).toBe("failed");
    expect(statuses(run)).toMatchObject({ write: "pass", read: "fail", clean: "skipped" });
  });
});

describe("cancelling", () => {
  it("stops with an aborted error", async () => {
    const { client } = fake({ ...ok, ListObjectsV2Command: () => Promise.reject(service("AbortError", 0)) });
    const controller = new AbortController();
    controller.abort();
    await expect(runConnectionTest({ ...base, client, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  });
});
