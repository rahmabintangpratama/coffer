// Bundled for the browser by tests/e2e/bundle.ts and run on a page whose origin
// is the one allowed by the CORS rule, so the browser does real preflights
// against the S3 fixture.
import { createClient, runConnectionTest, type ConnectionTestRun } from "@/lib/s3";

interface RunOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket?: string;
  prefix?: string;
}

declare global {
  interface Window {
    coffer: { run: (options: RunOptions) => Promise<ConnectionTestRun> };
  }
}

window.coffer = {
  run: (options) =>
    runConnectionTest({
      client: createClient({
        endpoint: options.endpoint,
        region: options.region,
        forcePathStyle: true,
        credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
        maxAttempts: 1,
      }),
      endpoint: options.endpoint,
      ...(options.bucket === undefined ? {} : { bucket: options.bucket }),
      ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
    }),
};
