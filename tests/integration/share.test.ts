import { HeadBucketCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clockOffsetOf, presignShare, shareLimits, signShareUrl } from "@/lib/s3/share";
import { createBucket, createClient } from "./client";
import { admin } from "./config";

// FR-60, FR-61 against a real server: a link downloads, stops after its expiry, and survives a wrong device clock.
const client: S3Client = createClient(admin);
let bucket = "";
const key = "docs/Quarterly report 日本語.txt";
const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

beforeAll(async () => {
  bucket = await createBucket(client, "share");
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "shared body" }));
});
afterAll(() => { client.destroy(); });

describe("share links", () => {
  it("AC-60.2 a link made locally downloads the file under its own name", async () => {
    const limits = shareLimits({ sessionToken: false, now: Date.now() });
    const link = await presignShare(client, { bucket, key, name: "Quarterly report 日本語.txt", expiry: "15m", limits });
    const response = await fetch(link.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("shared body");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''Quarterly%20report%20%E6%97%A5%E6%9C%AC%E8%AA%9E.txt");
  });

  it("AC-60.2 a link with a 2-second life downloads, then stops working after it expires", async () => {
    const link = await signShareUrl(client, { bucket, key, name: "r.txt", seconds: 2 });
    expect((await fetch(link.url)).status).toBe(200);
    await sleep(3500);
    const late = await fetch(link.url);
    expect(late.status).toBe(403);
    expect(await late.text()).toMatch(/Expired|AccessDenied/);
  }, 20_000);

  it("clock offset: a device clock one hour behind still gives a working link once the offset is known", async () => {
    const behind = () => Date.now() - 3_600_000;
    // Without the offset the link is signed an hour in the past, so a 15-minute link is already over.
    const wrong = createClient(admin);
    const stale = await signShareUrl(wrong, { bucket, key, name: "r.txt", seconds: 900, now: behind });
    expect((await fetch(stale.url)).status).toBe(403);
    // With the offset the SDK learned (+1 hour), the signing date is the provider's time.
    (wrong.config as { systemClockOffset: number }).systemClockOffset = 3_600_000;
    const link = await signShareUrl(wrong, { bucket, key, name: "r.txt", seconds: 900, now: behind });
    const response = await fetch(link.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("shared body");
    wrong.destroy();
  });

  it("a device clock one hour ahead is corrected the same way", async () => {
    const ahead = () => Date.now() + 3_600_000;
    const wrong = createClient(admin);
    const stale = await signShareUrl(wrong, { bucket, key, name: "r.txt", seconds: 900, now: ahead });
    expect((await fetch(stale.url)).status).toBe(403);
    (wrong.config as { systemClockOffset: number }).systemClockOffset = -3_600_000;
    const link = await signShareUrl(wrong, { bucket, key, name: "r.txt", seconds: 900, now: ahead });
    expect((await fetch(link.url)).status).toBe(200);
    wrong.destroy();
  });

  it("clock offset: the client learns the provider's time from a response, and links are signed with it", async () => {
    const learning = createClient(admin);
    const real = Date.now.bind(Date);
    const spy = vi.spyOn(Date, "now").mockImplementation(() => real() - 3_600_000);
    try {
      // The first request is signed an hour in the past; the SDK retries with the time the server's answer gave it.
      await learning.send(new HeadBucketCommand({ Bucket: bucket }));
      expect(Math.abs(clockOffsetOf(learning) - 3_600_000)).toBeLessThan(60_000);
      const link = await signShareUrl(learning, { bucket, key, name: "r.txt", seconds: 900 });
      expect((await fetch(link.url)).status).toBe(200);
    } finally {
      spy.mockRestore();
      learning.destroy();
    }
  });
});
