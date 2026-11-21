import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { toAppError } from "./errors";
import { mimeOf } from "./keys";

/** How long a preview link lives (technical-spec 6.5): images 5 minutes, media 1 hour. A new one is signed on error. */
export const PREVIEW_SECONDS = { image: 300, media: 3600 } as const;

/**
 * A presigned GET for showing a file in the page (not saving it): `inline`
 * disposition and, when the extension tells, the media type to answer with. The
 * URL is held in component state only; never logged, stored or put in the page
 * address (AGENTS.md security rules).
 */
export async function presignView(client: S3Client, options: { bucket: string; key: string; name: string; seconds: number }): Promise<string> {
  const type = mimeOf(options.name);
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: options.bucket,
        Key: options.key,
        ResponseContentDisposition: "inline",
        ...(type === undefined ? {} : { ResponseContentType: type }),
      }),
      { expiresIn: options.seconds },
    );
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Read an object, or the first `length` bytes of it, through the signed API
 * (needs the CORS rule, which the connection test already proved). Text, SVG and
 * the signature sniff use this.
 */
export async function readObject(client: S3Client, options: { bucket: string; key: string; length?: number; signal?: AbortSignal }): Promise<Uint8Array> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: options.bucket,
        Key: options.key,
        ...(options.length === undefined ? {} : { Range: `bytes=0-${(Math.max(1, options.length) - 1).toString()}` }),
      }),
      options.signal ? { abortSignal: options.signal } : undefined,
    );
    const bytes = await response.Body?.transformToByteArray();
    // A provider that ignores Range sends everything; keep to what was asked for.
    return options.length === undefined || bytes === undefined ? (bytes ?? new Uint8Array(0)) : bytes.slice(0, options.length);
  } catch (error) {
    throw toAppError(error);
  }
}
