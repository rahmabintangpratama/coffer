import { CreateBucketCommand, PutBucketCorsCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createClient, uniqueName } from "../integration/client";
import { admin } from "../integration/config";
import { provisionTestUsers } from "../integration/provision";

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
export async function bareBucket(client: S3Client): Promise<string> {
  const Bucket = uniqueName("e2e-bare");
  await client.send(new CreateBucketCommand({ Bucket }));
  return Bucket;
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
}
