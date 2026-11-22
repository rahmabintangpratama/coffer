import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ShareExpiry, ShareLimits } from "@/lib/types";
import { attachmentDisposition } from "./disposition";
import { AppError, toAppError } from "./errors";

/** The expiry choices in order, with their lifetime in seconds (C-11). */
export const SHARE_CHOICES: readonly { id: ShareExpiry; seconds: number }[] = [
  { id: "15m", seconds: 900 },
  { id: "30m", seconds: 1800 },
  { id: "1h", seconds: 3600 },
  { id: "1d", seconds: 86_400 },
  { id: "7d", seconds: 604_800 },
];

/** SigV4 presigned URLs live at most 7 days. */
export const PRESIGN_MAX_SECONDS = 604_800;
/** A link must outlive its token by nothing: the last minute of the token is not offered. */
export const TOKEN_MARGIN_SECONDS = 60;
/** Without a known token expiry a link is capped here (C-12). */
export const UNKNOWN_EXPIRY_SECONDS = 3600;
/** The shortest choice. A cap below it leaves no choice at all (AC-61.3). */
export const MIN_SHARE_SECONDS = 900;

export const secondsOf = (expiry: ShareExpiry): number => SHARE_CHOICES.find((choice) => choice.id === expiry)?.seconds ?? SHARE_CHOICES[0]?.seconds ?? MIN_SHARE_SECONDS;

export interface ShareLimitsInput {
  /** Whether the connection signs with a session token. */
  sessionToken: boolean;
  /** ISO 8601 expiry of the token, when known (C-12). */
  sessionTokenExpiresAt?: string | undefined;
  /** Milliseconds since the epoch on the clock the provider agrees with (the device clock plus the learned offset). */
  now: number;
}

export interface ShareLimitsResult extends ShareLimits {
  /** Seconds the token has left; null when there is no token or its expiry is unknown. */
  tokenSecondsLeft: number | null;
}

/**
 * How long a link may live (technical-spec 10): `min(7 days, seconds left on the token - 60)`. A token whose
 * expiry is not known caps links at 1 hour (C-12). Choices above `maxSeconds` are shown disabled, not hidden.
 */
export function shareLimits(input: ShareLimitsInput): ShareLimitsResult {
  if (!input.sessionToken && input.sessionTokenExpiresAt === undefined) return { maxSeconds: PRESIGN_MAX_SECONDS, reason: "presignLimit", tokenSecondsLeft: null };
  const expires = input.sessionTokenExpiresAt === undefined ? Number.NaN : Date.parse(input.sessionTokenExpiresAt);
  if (Number.isNaN(expires)) return { maxSeconds: UNKNOWN_EXPIRY_SECONDS, reason: "sessionToken", tokenSecondsLeft: null };
  const left = Math.max(0, Math.floor((expires - input.now) / 1000));
  return { maxSeconds: Math.max(0, Math.min(PRESIGN_MAX_SECONDS, left - TOKEN_MARGIN_SECONDS)), reason: "sessionToken", tokenSecondsLeft: left };
}

/** Choices the limits allow, longest last. */
export const allowedChoices = (limits: ShareLimits): ShareExpiry[] => SHARE_CHOICES.filter((choice) => choice.seconds <= limits.maxSeconds).map((choice) => choice.id);

/**
 * The preselected choice (C-11): 1 day for an ordinary key, the longest allowed one for a session token.
 * Null when nothing is allowed.
 */
export function defaultChoice(limits: ShareLimits): ShareExpiry | null {
  const allowed = allowedChoices(limits);
  if (limits.reason === "presignLimit") return allowed.includes("1d") ? "1d" : (allowed.at(-1) ?? null);
  return allowed.at(-1) ?? null;
}

/** The provider's clock as the client has learned it, in ms to add to the device clock. The SDK updates it from every response. */
export const clockOffsetOf = (client: S3Client): number => {
  const offset = (client.config as { systemClockOffset?: unknown }).systemClockOffset;
  return typeof offset === "number" && Number.isFinite(offset) ? offset : 0;
};

/** The current time on the clock the provider agrees with. */
export const providerNow = (client: S3Client, now: () => number = Date.now): number => now() + clockOffsetOf(client);

export interface ShareLink {
  url: string;
  /** When the link stops working, on the device clock. */
  expiresAt: Date;
}

export interface SignedLinkRequest {
  bucket: string;
  key: string;
  /** The file's name, offered to the recipient's browser as the download name. */
  name: string;
  seconds: number;
  /** Replaced by tests: the device clock in ms. */
  now?: () => number;
}

/**
 * Sign a GET for any lifetime up to 7 days. The signing date is the device clock plus the offset the client
 * learned, so a wrong device clock does not give an invalid link. Share dialogs go through `presignShare`, which
 * only takes the five choices; tests use this to make a link that lives 2 seconds.
 */
export async function signShareUrl(client: S3Client, request: SignedLinkRequest): Promise<ShareLink> {
  const device = (request.now ?? Date.now)();
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: request.bucket, Key: request.key, ResponseContentDisposition: attachmentDisposition(request.name) }),
      { expiresIn: request.seconds, signingDate: new Date(device + clockOffsetOf(client)) },
    );
    return { url, expiresAt: new Date(device + request.seconds * 1000) };
  } catch (error) {
    throw toAppError(error);
  }
}

export interface ShareLinkRequest {
  bucket: string;
  key: string;
  name: string;
  expiry: ShareExpiry;
  /** Limits the caller computed; the lifetime is checked against them here as well. */
  limits: ShareLimits;
  now?: () => number;
}

/**
 * A presigned GET with exactly the chosen lifetime, made locally: no request is sent. The URL is returned to the
 * dialog and nowhere else: it is not logged, stored or put in the page address.
 */
export async function presignShare(client: S3Client, request: ShareLinkRequest): Promise<ShareLink> {
  const seconds = secondsOf(request.expiry);
  if (seconds > request.limits.maxSeconds) throw new AppError("unsupported");
  return signShareUrl(client, { bucket: request.bucket, key: request.key, name: request.name, seconds, ...(request.now ? { now: request.now } : {}) });
}
