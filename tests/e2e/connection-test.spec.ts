import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PutBucketCorsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, expectConsole, PROVOKED_NETWORK_FAILURE, test } from "./test";
import type { ConnectionTestRun } from "../../src/lib/s3";
import { createBucket, createClient } from "../integration/client";
import { admin, s3Fixture, testUsers } from "../integration/config";
import { provisionTestUsers } from "../integration/provision";
import { bundleForBrowser } from "./bundle";

// The connection test in a real browser, against the S3 fixture, which sets CORS
// per bucket. The page's origin is the one the CORS rule allows, so the browser
// sends real preflights; a bucket without a rule must be blocked.
//
// The page is served by a real server on loopback, not by page.route(): Chromium
// treats a page it did not load from the network as "public" and then blocks
// requests to a loopback address (Local Network Access, see OQ-35).
let appOrigin = "";
let appServer: Server;

test.skip(({ viewport }) => viewport?.width !== 1440, "the width does not matter here; run once per engine");

let script = "";
let withCors = "";
let withoutCors = "";
const sdk = createClient(admin);

test.beforeAll(async () => {
  appServer = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<!doctype html><title>harness</title>");
  });
  await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  appOrigin = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  script = await bundleForBrowser("tests/e2e/harness/connection-test.entry.ts");
  await provisionTestUsers();
  withCors = await createBucket(sdk, "br-cors");
  withoutCors = await createBucket(sdk, "br-bare");
  for (const bucket of [withCors, withoutCors]) {
    await sdk.send(new PutObjectCommand({ Bucket: bucket, Key: "existing.txt", Body: "hello" }));
  }
  await sdk.send(
    new PutBucketCorsCommand({
      Bucket: withCors,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [appOrigin],
            AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Date", "x-amz-bucket-region"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
});

test.afterAll(() => {
  appServer.close();
});

async function appPage(page: Page): Promise<void> {
  await page.goto(`${appOrigin}/`);
  await page.addScriptTag({ content: script });
}

async function run(page: Page, options: { bucket?: string; accessKeyId?: string; secretAccessKey?: string; endpoint?: string }): Promise<ConnectionTestRun> {
  await appPage(page);
  const arguments_ = {
    endpoint: options.endpoint ?? s3Fixture.endpoint,
    region: s3Fixture.region,
    accessKeyId: options.accessKeyId ?? admin.accessKeyId,
    secretAccessKey: options.secretAccessKey ?? admin.secretAccessKey,
    ...(options.bucket === undefined ? {} : { bucket: options.bucket }),
  };
  return page.evaluate((input) => window.coffer.run(input), arguments_);
}

const table = (title: string, result: ConnectionTestRun) =>
  [`  ${title}  ->  ${result.outcome}`, ...result.steps.map((step) => `    ${step.id.padEnd(6)} ${step.status.padEnd(8)}${step.failure ? ` (${step.failure})` : ""}`)].join("\n");
const status = (result: ConnectionTestRun) => Object.fromEntries(result.steps.map((step) => [step.id, step.status]));

test("a bucket that allows the app origin passes all six steps", async ({ page, browserName }) => {
  const result = await run(page, { bucket: withCors });
  console.log(`[${browserName}] ok\n${table("allowed origin", result)}`);
  expect(result.outcome).toBe("ok");
  expect(status(result)).toEqual({ reach: "pass", cors: "pass", list: "pass", write: "pass", read: "pass", clean: "pass" });
});

test("a bucket without a CORS rule is reported as CORS, not as an unreachable host", async ({ page, browserName }) => {
  // A bucket without a CORS rule is blocked by the browser, which logs it.
  expectConsole(PROVOKED_NETWORK_FAILURE);
  const result = await run(page, { bucket: withoutCors });
  console.log(`[${browserName}] cors failure\n${table("no CORS rule", result)}`);
  expect(result.outcome).toBe("failed");
  expect(status(result)).toMatchObject({ reach: "pass", cors: "fail", list: "skipped", write: "skipped" });
  expect(result.steps.find((step) => step.id === "cors")?.failure).toBe("cors");
});

test("a host that nothing answers on is reported as a network problem", async ({ page }) => {
  // An unreachable port is the point of this test.
  expectConsole(PROVOKED_NETWORK_FAILURE);
  const result = await run(page, { bucket: withCors, endpoint: "http://127.0.0.1:1" });
  expect(result.outcome).toBe("failed");
  expect(status(result)).toMatchObject({ reach: "fail", cors: "skipped" });
  expect(result.steps[0]?.failure).toBe("network");
});

test("a read-only key is offered read-only", async ({ page, browserName }) => {
  const result = await run(page, { bucket: withCors, ...testUsers.readOnly });
  console.log(`[${browserName}] read-only\n${table("read-only key", result)}`);
  expect(result.outcome).toBe("readOnly");
  expect(result.readVerified).toBe(true);
  expect(status(result)).toMatchObject({ list: "pass", write: "fail", read: "skipped", clean: "skipped" });
});

test("a key that cannot delete fails on the clean step", async ({ page }) => {
  const result = await run(page, { bucket: withCors, ...testUsers.noDelete });
  expect(result.outcome).toBe("failed");
  expect(status(result)).toMatchObject({ write: "pass", read: "pass", clean: "fail" });
  expect(result.steps.find((step) => step.id === "clean")?.failure).toBe("accessDenied");
});

test("a wrong secret on a bucket with CORS is a signature problem", async ({ page, browserName }) => {
  const result = await run(page, { bucket: withCors, secretAccessKey: "not-the-secret" });
  console.log(`[${browserName}] wrong secret\n${table("wrong secret, CORS rule present", result)}`);
  expect(result.outcome).toBe("failed");
  expect(result.steps.find((step) => step.id === "list")?.failure).toBe("signatureDoesNotMatch");
});
