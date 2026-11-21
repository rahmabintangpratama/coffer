import { HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { toAppError } from "./errors";
import { listPage } from "./list";

/** At or below this many keys each is checked with HeadObject; above it the target folders are listed (technical-spec 7). */
export const HEAD_LIMIT = 50;
const HEAD_CONCURRENCY = 8;

const parentOf = (key: string): string => key.slice(0, key.lastIndexOf("/") + 1);

async function exists(client: S3Client, bucket: string, key: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), signal ? { abortSignal: signal } : undefined);
    return true;
  } catch (error) {
    const app = toAppError(error);
    if (app.code === "noSuchKey") return false;
    throw app;
  }
}

/**
 * Which of `keys` already exist (FR-43). A small batch uses one HeadObject per
 * key; a large one lists each target folder once. The listing sees every key in
 * those folders, not only the loaded page, so a conflict past page one is found.
 */
export async function existingKeys(client: S3Client, options: { bucket: string; keys: readonly string[]; signal?: AbortSignal }): Promise<Set<string>> {
  const { bucket, keys, signal } = options;
  const found = new Set<string>();
  if (keys.length <= HEAD_LIMIT) {
    let next = 0;
    const worker = async () => {
      for (let index = next++; index < keys.length; index = next++) {
        const key = keys[index];
        if (key !== undefined && (await exists(client, bucket, key, signal))) found.add(key);
      }
    };
    await Promise.all(Array.from({ length: Math.min(HEAD_CONCURRENCY, keys.length) }, worker));
    return found;
  }
  const wanted = new Set(keys);
  for (const prefix of new Set(keys.map(parentOf))) {
    let token: string | undefined;
    do {
      const page = await listPage(client, { bucket, prefix, root: "", ...(token === undefined ? {} : { token }), ...(signal ? { signal } : {}) });
      for (const file of page.files) if (wanted.has(file.key)) found.add(file.key);
      token = page.nextToken;
    } while (token !== undefined);
  }
  return found;
}

/** A folder is a zero-byte placeholder object whose key ends in "/" (C-18, FR-35). */
export async function putFolder(client: S3Client, options: { bucket: string; key: string }): Promise<void> {
  try {
    await client.send(new PutObjectCommand({ Bucket: options.bucket, Key: options.key, Body: new Uint8Array(0), ContentType: "application/x-directory" }));
  } catch (error) {
    throw toAppError(error);
  }
}
