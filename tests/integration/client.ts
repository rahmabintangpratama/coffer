import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { type Credentials, s3Fixture } from "./config";

/** A client with the settings Coffer will use: path-style and WHEN_REQUIRED checksums. */
export function createClient(credentials: Credentials): S3Client {
  return new S3Client({
    endpoint: s3Fixture.endpoint,
    region: s3Fixture.region,
    forcePathStyle: true,
    credentials,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function createBucket(client: S3Client, prefix = "t"): Promise<string> {
  const Bucket = uniqueName(prefix);
  await client.send(new CreateBucketCommand({ Bucket }));
  return Bucket;
}
