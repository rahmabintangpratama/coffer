import { deleteBucket, removePrefix } from "../integration/cleanup";
import { createClient, createdBuckets } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";

// What one test writes to the S3 fixture goes when it ends (tests/AGENTS.md): folders from `scratchPrefix` in the
// shared bucket, with their trash, and the buckets made with `createBucket` while the test ran.

const prefixes = new Set<string>();

/** A folder of its own in the shared bucket, removed after the test. Call it in a test or a `beforeEach`. */
export function scratchPrefix(area: string): string {
  const prefix = `${area}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  prefixes.add(prefix);
  return prefix;
}

/** Marks the start of a test; the returned function removes what it wrote. Buckets made before (in `beforeAll`) stay. */
export function startScratch(): () => Promise<void> {
  prefixes.clear();
  const before = new Set(createdBuckets);
  return async () => {
    const made = [...createdBuckets].filter((bucket) => !before.has(bucket));
    if (prefixes.size === 0 && made.length === 0) return;
    const client = createClient(admin);
    try {
      for (const prefix of prefixes) await removePrefix(client, E2E_BUCKET, prefix);
      for (const bucket of made) {
        await deleteBucket(client, bucket);
        createdBuckets.delete(bucket);
      }
    } finally {
      prefixes.clear();
      client.destroy();
    }
  };
}
