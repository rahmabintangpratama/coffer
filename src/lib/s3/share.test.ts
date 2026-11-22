import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "./client";
import { allowedChoices, clockOffsetOf, defaultChoice, presignShare, providerNow, secondsOf, shareLimits } from "./share";

const NOW = Date.parse("2026-11-22T10:00:00Z");
const inSeconds = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();
const client = (): S3Client => createClient({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "fake-key", secretAccessKey: "fake-secret" } });
const query = (url: string) => new URL(url).searchParams;

// FR-60, FR-61, C-11, C-12: the limits.
describe("shareLimits (AC-61.2, AC-61.3, C-12)", () => {
  it("AC-60.1 an ordinary key may use all five choices and defaults to 1 day", () => {
    const limits = shareLimits({ sessionToken: false, now: NOW });
    expect(limits).toEqual({ maxSeconds: 604_800, reason: "presignLimit", tokenSecondsLeft: null });
    expect(allowedChoices(limits)).toEqual(["15m", "30m", "1h", "1d", "7d"]);
    expect(defaultChoice(limits)).toBe("1d");
  });

  it("a token with 3 hours left allows up to 2 hours 59 minutes, so 1 hour and shorter, and defaults to the longest", () => {
    const limits = shareLimits({ sessionToken: true, sessionTokenExpiresAt: inSeconds(3 * 3600), now: NOW });
    expect(limits).toEqual({ maxSeconds: 3 * 3600 - 60, reason: "sessionToken", tokenSecondsLeft: 3 * 3600 });
    expect(allowedChoices(limits)).toEqual(["15m", "30m", "1h"]);
    expect(defaultChoice(limits)).toBe("1h");
  });

  it("a token with 30 days left is capped at 7 days but is still a token (the longest choice is the default)", () => {
    const limits = shareLimits({ sessionToken: true, sessionTokenExpiresAt: inSeconds(30 * 86_400), now: NOW });
    expect(limits.maxSeconds).toBe(604_800);
    expect(limits.reason).toBe("sessionToken");
    expect(defaultChoice(limits)).toBe("7d");
  });

  it("AC-61.3 a token with under 15 minutes left allows nothing", () => {
    for (const left of [900, 959, 200, 0]) {
      const limits = shareLimits({ sessionToken: true, sessionTokenExpiresAt: inSeconds(left), now: NOW });
      expect(allowedChoices(limits)).toEqual([]);
      expect(defaultChoice(limits)).toBeNull();
    }
    expect(allowedChoices(shareLimits({ sessionToken: true, sessionTokenExpiresAt: inSeconds(960), now: NOW }))).toEqual(["15m"]);
  });

  it("an expired token has no seconds left, not a negative number", () => {
    expect(shareLimits({ sessionToken: true, sessionTokenExpiresAt: inSeconds(-500), now: NOW })).toMatchObject({ maxSeconds: 0, tokenSecondsLeft: 0 });
  });

  it("C-12 a token with no known expiry caps links at 1 hour", () => {
    for (const expires of [undefined, "not a date"]) {
      const limits = shareLimits({ sessionToken: true, sessionTokenExpiresAt: expires, now: NOW });
      expect(limits).toEqual({ maxSeconds: 3600, reason: "sessionToken", tokenSecondsLeft: null });
      expect(allowedChoices(limits)).toEqual(["15m", "30m", "1h"]);
      expect(defaultChoice(limits)).toBe("1h");
    }
  });

  it("a known expiry counts as a token even when the flag is off", () => {
    expect(shareLimits({ sessionToken: false, sessionTokenExpiresAt: inSeconds(2000), now: NOW }).reason).toBe("sessionToken");
  });
});

describe("presignShare (AC-60.2, AC-60.5)", () => {
  const limits = shareLimits({ sessionToken: false, now: NOW });

  it("signs exactly the chosen lifetime and reports when it ends", async () => {
    const link = await presignShare(client(), { bucket: "b", key: "docs/a b.txt", name: "a b.txt", expiry: "1d", limits, now: () => NOW });
    expect(query(link.url).get("X-Amz-Expires")).toBe("86400");
    expect(link.expiresAt.toISOString()).toBe("2026-11-23T10:00:00.000Z");
    expect(new URL(link.url).hostname).toBe("127.0.0.1");
    expect(query(link.url).get("response-content-disposition")).toContain("attachment");
  });

  it("every choice has its own lifetime", async () => {
    for (const [expiry, seconds] of [["15m", 900], ["30m", 1800], ["1h", 3600], ["7d", 604_800]] as const) {
      const link = await presignShare(client(), { bucket: "b", key: "k", name: "k", expiry, limits, now: () => NOW });
      expect(query(link.url).get("X-Amz-Expires")).toBe(String(seconds));
      expect(secondsOf(expiry)).toBe(seconds);
    }
  });

  it("refuses a choice above the limit", async () => {
    const capped = shareLimits({ sessionToken: true, sessionTokenExpiresAt: inSeconds(7200), now: NOW });
    await expect(presignShare(client(), { bucket: "b", key: "k", name: "k", expiry: "1d", limits: capped, now: () => NOW })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("makes no request", async () => {
    const fetched = vi.spyOn(globalThis, "fetch");
    await presignShare(client(), { bucket: "b", key: "k", name: "k", expiry: "15m", limits, now: () => NOW });
    expect(fetched).not.toHaveBeenCalled();
    fetched.mockRestore();
  });
});

// C-12 and technical-spec 10: the signing date is the device clock plus the learned offset.
describe("clock offset signing", () => {
  const limits = shareLimits({ sessionToken: false, now: NOW });
  const amzDate = (url: string) => query(url).get("X-Amz-Date");

  it("signs with the device clock when nothing was learned", async () => {
    const handle = client();
    expect(clockOffsetOf(handle)).toBe(0);
    const link = await presignShare(handle, { bucket: "b", key: "k", name: "k", expiry: "1h", limits, now: () => NOW });
    expect(amzDate(link.url)).toBe("20261122T100000Z");
  });

  it("a device clock 1 hour behind signs the provider's time, and the link ends on the device clock", async () => {
    const handle = client();
    (handle.config as { systemClockOffset: number }).systemClockOffset = 3_600_000;
    const behind = NOW - 3_600_000;
    const link = await presignShare(handle, { bucket: "b", key: "k", name: "k", expiry: "1h", limits, now: () => behind });
    expect(amzDate(link.url)).toBe("20261122T100000Z");
    expect(providerNow(handle, () => behind)).toBe(NOW);
    expect(link.expiresAt.getTime()).toBe(behind + 3_600_000);
  });

  it("a device clock ahead of the provider signs earlier time", async () => {
    const handle = client();
    (handle.config as { systemClockOffset: number }).systemClockOffset = -120_000;
    const link = await presignShare(handle, { bucket: "b", key: "k", name: "k", expiry: "15m", limits, now: () => NOW + 120_000 });
    expect(amzDate(link.url)).toBe("20261122T100000Z");
  });
});
