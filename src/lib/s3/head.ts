import { HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { toAppError } from "./errors";

export interface ObjectHead {
  contentType: string;
}

/** The few fields the Details panel needs that a listing does not carry (FR-27). */
export async function headObject(client: S3Client, options: { bucket: string; key: string; signal?: AbortSignal }): Promise<ObjectHead> {
  try {
    const response = await client.send(
      new HeadObjectCommand({ Bucket: options.bucket, Key: options.key }),
      options.signal ? { abortSignal: options.signal } : undefined,
    );
    return { contentType: response.ContentType ?? "" };
  } catch (error) {
    throw toAppError(error);
  }
}
