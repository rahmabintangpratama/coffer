import { bucketNames, deleteBucket } from "./cleanup";
import { createClient } from "./client";
import { admin, s3Fixture } from "./config";
import { provisionTestUsers } from "./provision";

async function waitForFixture(): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const response = await fetch(`${s3Fixture.endpoint}/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(
        `The S3 fixture is not reachable at ${s3Fixture.endpoint}. Start it with: ` +
          "docker compose -f tests/integration/docker-compose.yml up -d --wait",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export default async function setup(): Promise<void> {
  await waitForFixture();
  await provisionTestUsers();
  await removeLeftovers();
}

/** Buckets a run that was stopped never deleted. The e2e buckets (`coffer-e2e-*`) are the e2e setup's to reset. */
async function removeLeftovers(): Promise<void> {
  const client = createClient(admin);
  try {
    for (const bucket of await bucketNames(client)) if (!bucket.startsWith("coffer-e2e-")) await deleteBucket(client, bucket);
  } finally {
    client.destroy();
  }
}
