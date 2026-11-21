import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { attachmentDisposition } from "./disposition";
import { toAppError } from "./errors";

/** Download links live 60 s (technical-spec 6.5): long enough for the browser to start, too short to be worth keeping. */
export const DOWNLOAD_SECONDS = 60;

/**
 * A short-lived presigned GET that makes the browser save the file under its own
 * name. The URL is signed locally, held by the caller for one navigation and
 * never logged or stored (AGENTS.md security rules).
 */
export async function presignDownload(
  client: S3Client,
  options: { bucket: string; key: string; filename: string; seconds?: number },
): Promise<string> {
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: options.bucket,
        Key: options.key,
        ResponseContentDisposition: attachmentDisposition(options.filename),
      }),
      { expiresIn: options.seconds ?? DOWNLOAD_SECONDS },
    );
  } catch (error) {
    throw toAppError(error);
  }
}
