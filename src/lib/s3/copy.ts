import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  type S3Client,
  UploadPartCopyCommand,
} from "@aws-sdk/client-s3";
import { AppError, toAppError } from "./errors";
import { MAX_PARTS, MIB } from "./upload";

/** CopyObject handles up to 5 GB in one request; above it a multipart copy runs. The limit is a constant so tests can lower it. */
export const COPY_SINGLE_LIMIT = 5 * 1024 * MIB;
const MIN_COPY_PART = 256 * MIB;

/** Part size of a multipart copy: at least 256 MiB, and large enough to stay under 10,000 parts. */
export function copyPartSizeFor(size: number): number {
  return Math.max(MIN_COPY_PART, Math.ceil(Math.ceil(size / 9000) / MIB) * MIB);
}

/** `bucket/key` with every key segment percent-encoded, which CopySource requires and the SDK does not do. */
export const copySourceOf = (bucket: string, key: string): string => `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

export interface CopyOptions {
  bucket: string;
  sourceKey: string;
  targetKey: string;
  size: number;
  /** Lowered by tests; default COPY_SINGLE_LIMIT. */
  singleLimit?: number;
  /** Lowered by tests; default `copyPartSizeFor(size)`. */
  partSize?: number;
  signal?: AbortSignal;
}

/**
 * Copy one object inside a bucket with its content type and metadata (FR-33, AC-33.2):
 * CopyObject up to the limit, then HeadObject for the metadata, a multipart upload on the
 * target and one UploadPartCopy per byte range. A failed multipart copy is aborted.
 */
export async function copyObject(client: S3Client, options: CopyOptions): Promise<void> {
  const { bucket, sourceKey, targetKey, size, signal } = options;
  const abort = signal ? { abortSignal: signal } : undefined;
  const limit = options.singleLimit ?? COPY_SINGLE_LIMIT;
  try {
    if (size <= limit) {
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: targetKey, CopySource: copySourceOf(bucket, sourceKey), MetadataDirective: "COPY" }), abort);
      return;
    }
    const partSize = options.partSize ?? copyPartSizeFor(size);
    const count = Math.ceil(size / partSize);
    if (count > MAX_PARTS) throw new AppError("unsupported");
    // A multipart copy carries no metadata by itself, so it is read here and sent with the Create.
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }), abort);
    const created = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: targetKey,
        ...(head.ContentType === undefined ? {} : { ContentType: head.ContentType }),
        ...(head.CacheControl === undefined ? {} : { CacheControl: head.CacheControl }),
        ...(head.ContentDisposition === undefined ? {} : { ContentDisposition: head.ContentDisposition }),
        ...(head.ContentEncoding === undefined ? {} : { ContentEncoding: head.ContentEncoding }),
        ...(head.ContentLanguage === undefined ? {} : { ContentLanguage: head.ContentLanguage }),
        ...(head.Metadata === undefined ? {} : { Metadata: head.Metadata }),
      }),
      abort,
    );
    const uploadId = created.UploadId;
    if (uploadId === undefined) throw new AppError("unsupported");
    try {
      const parts: { PartNumber: number; ETag: string }[] = [];
      for (let index = 0; index < count; index += 1) {
        const start = index * partSize;
        const end = Math.min(start + partSize, size) - 1;
        const part = await client.send(
          new UploadPartCopyCommand({ Bucket: bucket, Key: targetKey, UploadId: uploadId, PartNumber: index + 1, CopySource: copySourceOf(bucket, sourceKey), CopySourceRange: `bytes=${start.toString()}-${end.toString()}` }),
          abort,
        );
        const etag = part.CopyPartResult?.ETag;
        if (etag === undefined) throw new AppError("unsupported");
        parts.push({ PartNumber: index + 1, ETag: etag });
      }
      await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: targetKey, UploadId: uploadId, MultipartUpload: { Parts: parts } }), abort);
    } catch (error) {
      await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: targetKey, UploadId: uploadId })).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    throw toAppError(error);
  }
}
