import { afterAll } from "vitest";
import { deleteBucket } from "./cleanup";
import { createClient, createdBuckets } from "./client";
import { admin } from "./config";

// Loaded into every integration test file: the buckets a file made, with everything left in them, go when it ends.
afterAll(async () => {
  const client = createClient(admin);
  try {
    for (const bucket of createdBuckets) await deleteBucket(client, bucket);
    createdBuckets.clear();
  } finally {
    client.destroy();
  }
}, 120_000);
