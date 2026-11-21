// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AppError, isNetworkFailure, toAppError } from "./errors";

const service = (name: string, status: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(`secret detail for ${name}`), { name, $metadata: { httpStatusCode: status, requestId: "REQ1" }, ...extra });

describe("toAppError", () => {
  it.each([
    ["AccessDenied", 403, "accessDenied"],
    ["SignatureDoesNotMatch", 403, "signature"],
    ["InvalidAccessKeyId", 403, "signature"],
    ["RequestTimeTooSkewed", 403, "clockSkew"],
    ["AuthorizationHeaderMalformed", 400, "wrongRegion"],
    ["PermanentRedirect", 301, "wrongRegion"],
    ["NoSuchBucket", 404, "noSuchBucket"],
    ["NoSuchKey", 404, "noSuchKey"],
    ["NotFound", 404, "noSuchKey"],
    ["ExpiredToken", 400, "expiredToken"],
    ["SlowDown", 503, "throttled"],
    ["PreconditionFailed", 412, "conflict"],
    ["NotImplemented", 501, "unsupported"],
    ["MissingContentMD5", 400, "unsupported"],
    ["AbortError", 0, "aborted"],
  ])("maps %s (%i) to %s", (name, status, code) => {
    expect(toAppError(service(name, status)).code).toBe(code);
  });

  it("falls back to the HTTP status when the error name is unknown", () => {
    expect(toAppError(service("Strange", 403)).code).toBe("accessDenied");
    expect(toAppError(service("Strange", 429)).code).toBe("throttled");
    expect(toAppError(service("Strange", 418)).code).toBe("unknown");
  });

  it("marks throttling and server errors as retryable, not access errors", () => {
    expect(toAppError(service("SlowDown", 503)).retryable).toBe(true);
    expect(toAppError(service("Strange", 500)).retryable).toBe(true);
    expect(toAppError(service("AccessDenied", 403)).retryable).toBe(false);
  });

  it("never carries the original message", () => {
    const app = toAppError(service("AccessDenied", 403));
    expect(app.message).toBe("accessDenied");
    expect(JSON.stringify([app.code, app.status, app.hint, app.message, app.requestId])).not.toContain("secret detail");
    expect(app.requestId).toBe("REQ1");
    expect(app.status).toBe(403);
  });

  it("reads the suggested region from the error body or the bucket-region header", () => {
    expect(toAppError(service("AuthorizationHeaderMalformed", 400, { Region: "eu-west-1" })).hint).toEqual({ suggestedRegion: "eu-west-1" });
    const redirect = service("PermanentRedirect", 301, { $response: { headers: { "x-amz-bucket-region": "ap-southeast-2" } } });
    expect(toAppError(redirect).hint?.suggestedRegion).toBe("ap-southeast-2");
  });

  it("derives the clock offset in minutes from server and request time", () => {
    const skew = service("RequestTimeTooSkewed", 403, { RequestTime: "20261121T120000Z", ServerTime: "2026-11-21T12:12:00Z" });
    // RequestTime in basic format does not parse, so no offset: only well-formed times count.
    expect(toAppError(skew).hint?.clockOffsetMinutes).toBeUndefined();
    const parsed = service("RequestTimeTooSkewed", 403, { RequestTime: "2026-11-21T12:00:00Z", ServerTime: "2026-11-21T12:12:00Z" });
    expect(toAppError(parsed).hint?.clockOffsetMinutes).toBe(12);
    const behind = service("RequestTimeTooSkewed", 403, { RequestTime: "2026-11-21T12:30:00Z", ServerTime: "2026-11-21T12:00:00Z" });
    expect(toAppError(behind).hint?.clockOffsetMinutes).toBe(-30);
  });

  it("passes an AppError through unchanged", () => {
    const original = new AppError("locked");
    expect(toAppError(original)).toBe(original);
  });

  it("copes with values that are not errors", () => {
    expect(toAppError("boom").code).toBe("unknown");
    expect(toAppError(undefined).code).toBe("unknown");
    expect(toAppError(null).code).toBe("unknown");
  });
});

describe("isNetworkFailure", () => {
  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "fetch failed"])(
    "treats a TypeError %j as a network failure",
    (message) => {
      expect(isNetworkFailure(new TypeError(message))).toBe(true);
      expect(toAppError(new TypeError(message)).code).toBe("network");
    },
  );

  it("treats connection error codes and timeouts as network failures", () => {
    expect(isNetworkFailure(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(isNetworkFailure(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true);
  });

  it("does not treat a service error or an unrelated TypeError as one", () => {
    expect(isNetworkFailure(service("AccessDenied", 403))).toBe(false);
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isNetworkFailure("text")).toBe(false);
  });
});
