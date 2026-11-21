import { S3Client } from "@aws-sdk/client-s3";
import type { Credentials } from "@/lib/types";

export interface ClientConfig {
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  /** Static keys, or a function the SDK calls for each request (so a locked vault can refuse). */
  credentials: Credentials | (() => Promise<Credentials>);
  /** Total tries per request. The connection test uses 1 so a CORS block fails at once. Default 3. */
  maxAttempts?: number;
}

/**
 * One client per connection. Checksums are only sent where the operation
 * requires them (WHEN_REQUIRED), because several S3-compatible services reject
 * the default CRC headers (ADR-002). No middleware that logs requests is added.
 */
export function createClient(config: ClientConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: config.maxAttempts ?? 3,
    // A signed request is never served from or revalidated by the browser's HTTP cache: the cache rewrites Range
    // and adds If-None-Match, which breaks the signature (found when a 512-byte read preceded a 1 MiB read).
    requestHandler: { requestTimeout: 30_000, cache: "no-store" },
  });
}
