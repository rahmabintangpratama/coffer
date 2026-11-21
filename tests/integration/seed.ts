import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

/** Put empty objects with a bounded number of requests in flight. */
export async function putMany(client: S3Client, bucket: string, keys: readonly string[], concurrency = 32): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < keys.length; index = next++) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: keys[index] ?? "", Body: "" }));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}
