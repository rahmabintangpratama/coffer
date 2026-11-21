import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import { toAppError } from "./errors";
import { decodeS3Key } from "./keys";
import { PAGE_SIZE } from "./list";

export interface ObjectInfo {
  key: string;
  size: number;
  etag: string;
}

/**
 * Every object under a prefix, in key order, a page of up to 1,000 at a time, with no
 * delimiter (technical-spec 6.2 folder operations). `startAfter` resumes after a key
 * (the journal cursor). Keys are requested URL-encoded and decoded here; a provider
 * that rejects the parameter is retried once without it.
 */
export async function* listUnder(client: S3Client, options: { bucket: string; prefix: string; startAfter?: string | undefined; signal?: AbortSignal | undefined }): AsyncGenerator<ObjectInfo[]> {
  let token: string | undefined;
  let encode = true;
  for (;;) {
    const send = (useEncoding: boolean) =>
      client.send(
        new ListObjectsV2Command({
          Bucket: options.bucket,
          Prefix: options.prefix,
          MaxKeys: PAGE_SIZE,
          ...(useEncoding ? { EncodingType: "url" as const } : {}),
          ...(token === undefined ? (options.startAfter === undefined ? {} : { StartAfter: options.startAfter }) : { ContinuationToken: token }),
        }),
        options.signal ? { abortSignal: options.signal } : undefined,
      );
    let response;
    try {
      response = await send(encode);
    } catch (error) {
      const name = typeof error === "object" && error !== null && "name" in error ? String((error).name) : "";
      if (!encode || !["InvalidArgument", "InvalidRequest", "NotImplemented", "XNotImplemented"].includes(name)) throw toAppError(error);
      encode = false;
      try {
        response = await send(false);
      } catch (retry) {
        throw toAppError(retry);
      }
    }
    const decode = encode ? decodeS3Key : (value: string) => value;
    const page = (response.Contents ?? []).flatMap((object) =>
      object.Key === undefined ? [] : [{ key: decode(object.Key), size: object.Size ?? 0, etag: (object.ETag ?? "").replaceAll('"', "") }],
    );
    if (page.length > 0) yield page;
    if (response.IsTruncated !== true || response.NextContinuationToken === undefined) return;
    token = response.NextContinuationToken;
  }
}

/** How many objects are under a prefix (the plan's total), counted by listing. */
export async function countUnder(client: S3Client, options: { bucket: string; prefix: string; signal?: AbortSignal | undefined }): Promise<number> {
  let total = 0;
  for await (const page of listUnder(client, options)) total += page.length;
  return total;
}
