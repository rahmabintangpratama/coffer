// Every failure that leaves lib/s3 is an AppError. It carries a code, never the
// SDK's message, request URL, headers or signature, so it is safe to show and log
// (NFR-1). Hints are the few facts the UI uses to help: a region or a clock offset.

export type AppErrorCode =
  | "locked"
  | "cors"
  | "network"
  | "mixedContent"
  | "accessDenied"
  | "signature"
  | "clockSkew"
  | "noSuchBucket"
  | "noSuchKey"
  | "wrongRegion"
  | "expiredToken"
  | "throttled"
  | "conflict"
  | "quota"
  | "unsupported"
  | "aborted"
  | "unknown";

export interface ErrorHint {
  /** The region the bucket is really in. */
  suggestedRegion?: string;
  /** Server time minus device time, in minutes (positive: the device clock is behind). */
  clockOffsetMinutes?: number;
}

export interface AppErrorInit {
  retryable?: boolean;
  status?: number;
  hint?: ErrorHint;
  requestId?: string;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly hint: ErrorHint | undefined;
  readonly requestId: string | undefined;

  constructor(code: AppErrorCode, init: AppErrorInit = {}) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.retryable = init.retryable ?? false;
    this.status = init.status;
    this.hint = init.hint;
    this.requestId = init.requestId;
  }
}

const BY_NAME: Record<string, AppErrorCode> = {
  AccessDenied: "accessDenied",
  Forbidden: "accessDenied",
  AllAccessDisabled: "accessDenied",
  SignatureDoesNotMatch: "signature",
  InvalidAccessKeyId: "signature",
  RequestTimeTooSkewed: "clockSkew",
  AuthorizationHeaderMalformed: "wrongRegion",
  PermanentRedirect: "wrongRegion",
  IllegalLocationConstraintException: "wrongRegion",
  NoSuchBucket: "noSuchBucket",
  NoSuchKey: "noSuchKey",
  NotFound: "noSuchKey",
  ExpiredToken: "expiredToken",
  ExpiredTokenException: "expiredToken",
  InvalidToken: "expiredToken",
  TokenRefreshRequired: "expiredToken",
  SlowDown: "throttled",
  ServiceUnavailable: "throttled",
  Throttling: "throttled",
  ThrottlingException: "throttled",
  RequestLimitExceeded: "throttled",
  PreconditionFailed: "conflict",
  OperationAborted: "conflict",
  ConditionalRequestConflict: "conflict",
  NotImplemented: "unsupported",
  XNotImplemented: "unsupported",
  MissingContentMD5: "unsupported",
  QuotaExceeded: "quota",
  AbortError: "aborted",
  LockedError: "locked",
};

const BY_STATUS: Record<number, AppErrorCode> = {
  301: "wrongRegion",
  403: "accessDenied",
  404: "noSuchKey",
  409: "conflict",
  412: "conflict",
  429: "throttled",
  501: "unsupported",
  503: "throttled",
};

const NETWORK_MESSAGE = /failed to fetch|load failed|networkerror|network request failed|fetch failed|network error/i;
const NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "EHOSTUNREACH"]);

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  $metadata?: { httpStatusCode?: unknown; requestId?: unknown };
  $response?: { headers?: Record<string, string> };
  Region?: unknown;
  RequestTime?: unknown;
  ServerTime?: unknown;
}

const asText = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/**
 * A fetch that never got an HTTP response: DNS, TLS or connection failure,
 * mixed content, or a CORS block. The browser reports all of these as the same
 * TypeError, so the caller tells them apart (see the connection test).
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof AppError) return error.code === "network" || error.code === "cors";
  const like = error as ErrorLike | null;
  if (like === null || typeof like !== "object") return false;
  if (like.name === "TimeoutError") return true;
  if (typeof like.code === "string" && NETWORK_CODES.has(like.code)) return true;
  return error instanceof TypeError && NETWORK_MESSAGE.test(asText(like.message) ?? "");
}

function hintFrom(like: ErrorLike): ErrorHint | undefined {
  const hint: ErrorHint = {};
  const region = asText(like.Region) ?? asText(like.$response?.headers?.["x-amz-bucket-region"]);
  if (region !== undefined) hint.suggestedRegion = region;
  const server = Date.parse(asText(like.ServerTime) ?? "");
  const request = Date.parse(asText(like.RequestTime) ?? "");
  if (Number.isFinite(server) && Number.isFinite(request)) {
    hint.clockOffsetMinutes = Math.round((server - request) / 60_000);
  }
  return Object.keys(hint).length > 0 ? hint : undefined;
}

/** Map anything thrown by the SDK or fetch to an AppError. Never keeps the original message. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const like = (typeof error === "object" && error !== null ? error : {}) as ErrorLike;
  if (isNetworkFailure(error)) return new AppError("network", { retryable: true });

  const status = typeof like.$metadata?.httpStatusCode === "number" ? like.$metadata.httpStatusCode : undefined;
  const name = asText(like.name);
  const code: AppErrorCode =
    (name !== undefined ? BY_NAME[name] : undefined) ?? (status !== undefined ? BY_STATUS[status] : undefined) ?? "unknown";
  const hint = hintFrom(like);
  const requestId = asText(like.$metadata?.requestId);
  const retryable = code === "throttled" || code === "network" || (code === "unknown" && status !== undefined && status >= 500);
  return new AppError(code, {
    retryable,
    ...(status === undefined ? {} : { status }),
    ...(hint === undefined ? {} : { hint }),
    ...(requestId === undefined ? {} : { requestId }),
  });
}
