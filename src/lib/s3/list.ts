import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import type { FileItem, FolderItem } from "@/lib/types";
import { toAppError } from "./errors";
import { decodeS3Key, fileKindOf, nameOf, trashPrefixOf } from "./keys";

export const PAGE_SIZE = 1000;

export interface ListPageOptions {
  bucket: string;
  /** The folder to list: "" or a prefix ending in "/". */
  prefix: string;
  /** The connection root ("" or ending in "/"), whose `.trash/` is hidden. */
  root: string;
  token?: string;
  signal?: AbortSignal;
}

export interface ListPage {
  folders: FolderItem[];
  files: FileItem[];
  /** Folders plus files in this page. */
  count: number;
  nextToken?: string;
}

// Providers that reject EncodingType are remembered per client, so the retry costs one request, not one per page.
const withoutEncoding = new WeakSet<S3Client>();

const REJECTS_ENCODING = new Set(["InvalidArgument", "InvalidRequest", "NotImplemented", "XNotImplemented", "MalformedXML"]);

function rejectsEncoding(error: unknown): boolean {
  const name = typeof error === "object" && error !== null && "name" in error ? (error as { name?: unknown }).name : undefined;
  return typeof name === "string" && REJECTS_ENCODING.has(name);
}

async function send(client: S3Client, options: ListPageOptions, encode: boolean) {
  return client.send(
    new ListObjectsV2Command({
      Bucket: options.bucket,
      Prefix: options.prefix,
      Delimiter: "/",
      MaxKeys: PAGE_SIZE,
      ...(encode ? { EncodingType: "url" as const } : {}),
      ...(options.token === undefined ? {} : { ContinuationToken: options.token }),
    }),
    options.signal ? { abortSignal: options.signal } : undefined,
  );
}

/**
 * One page of a folder (technical-spec 6.2). Keys and prefixes are URL-decoded
 * here. The folder placeholder (a key equal to the prefix) and the trash prefix
 * are skipped. Failures leave as AppError.
 */
export async function listPage(client: S3Client, options: ListPageOptions): Promise<ListPage> {
  let encoded = !withoutEncoding.has(client);
  let response;
  try {
    response = await send(client, options, encoded);
  } catch (error) {
    if (!encoded || !rejectsEncoding(error)) throw toAppError(error);
    withoutEncoding.add(client);
    encoded = false;
    try {
      response = await send(client, options, false);
    } catch (retry) {
      throw toAppError(retry);
    }
  }

  const decode = encoded ? decodeS3Key : (value: string) => value;
  const trash = trashPrefixOf(options.root);

  const folders: FolderItem[] = [];
  for (const entry of response.CommonPrefixes ?? []) {
    if (entry.Prefix === undefined) continue;
    const key = decode(entry.Prefix);
    if (key === trash) continue;
    folders.push({ kind: "folder", key, name: nameOf(key) });
  }

  const files: FileItem[] = [];
  for (const object of response.Contents ?? []) {
    if (object.Key === undefined) continue;
    const key = decode(object.Key);
    if (key === options.prefix) continue;
    // With a delimiter only this folder's own placeholder can end in "/"; anything else is not a file.
    if (key.endsWith("/")) continue;
    const name = nameOf(key);
    files.push({
      kind: "file",
      key,
      name,
      size: object.Size ?? 0,
      lastModified: object.LastModified?.toISOString() ?? "",
      etag: (object.ETag ?? "").replaceAll('"', ""),
      contentType: "",
      fileKind: fileKindOf(name),
    });
  }

  const nextToken = response.IsTruncated === true ? response.NextContinuationToken : undefined;
  return { folders, files, count: folders.length + files.length, ...(nextToken === undefined ? {} : { nextToken }) };
}
