// @vitest-environment node
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { afterEach, describe, expect, it } from "vitest";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { clientFor, withLeasedClient } from "./connection-client";

// C-27, ADR-005: a lock stops the shared clients at once, and a lease keeps its own client working.
const connection: ConnectionSummary = {
  id: "client-c1", name: "n", providerId: "custom", fields: {}, endpoint: "http://127.0.0.1:9000", region: "us-east-1",
  addressingStyle: "path", bucket: "b", access: "readWrite", createdAt: "2026-01-01T00:00:00Z",
};
const sign = (client: ReturnType<typeof clientFor>) => getSignedUrl(client, new GetObjectCommand({ Bucket: "b", Key: "k" }), { expiresIn: 60 });

afterEach(() => {
  vault.stopLeases({ includeWaiting: true });
  vault.lock();
});

describe("the shared client reads the keys for every request", () => {
  it("signs while the keys are there and stops signing the moment they are locked, even for a client someone still holds", async () => {
    vault.put(connection.id, { accessKeyId: "fake-key", secretAccessKey: "fake-secret" });
    const held = clientFor(connection);
    expect(await sign(held)).toContain("X-Amz-Signature=");
    expect(await sign(held)).toContain("fake-key");
    vault.lock();
    await expect(sign(held)).rejects.toMatchObject({ name: "LockedError" });
  });

  it("picks up new keys without a new client", async () => {
    vault.put(connection.id, { accessKeyId: "first-key", secretAccessKey: "fake-secret" });
    const client = clientFor(connection);
    expect(await sign(client)).toContain("first-key");
    vault.put(connection.id, { accessKeyId: "second-key", secretAccessKey: "fake-secret" });
    expect(await sign(client)).toContain("second-key");
  });
});

describe("a leased client", () => {
  it("keeps signing with its own copy after a lock, and is gone with the lease", async () => {
    vault.put(connection.id, { accessKeyId: "lease-key", secretAccessKey: "fake-secret" });
    let url = "";
    await withLeasedClient(connection, async (client) => {
      vault.lock();
      url = await sign(client);
    });
    expect(url).toContain("lease-key");
    expect(vault.leaseCount()).toBe(0);
  });

  it("refuses to start while locked unless it waits", async () => {
    await expect(withLeasedClient(connection, () => Promise.resolve("ran"))).rejects.toMatchObject({ name: "LockedError" });
  });
});
