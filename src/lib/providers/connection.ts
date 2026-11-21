import type { AddressingStyle, Credentials, ProviderPreset } from "@/lib/types";
import { buildEndpoint, hostLooksRight, isLocalHost, type EndpointProblem } from "./endpoint";
import {
  ADVANCED_FIELDS,
  type FieldError,
  type FieldValues,
  isVisible,
  normalizePrefix,
  validateFields,
} from "./fields";

/** S3 signs with a region even where the provider ignores it; this is the conventional stand-in. */
export const FALLBACK_REGION = "us-east-1";

export type { Credentials };

// ---------------------------------------------------------------- region

/** The first value that is not empty (an empty string counts as "not given"). */
function firstNonEmpty(...candidates: (string | null | undefined)[]): string {
  return candidates.find((candidate) => candidate !== null && candidate !== undefined && candidate !== "") ?? "";
}

/** The field that holds the region, if the preset has one. */
export function regionFieldId(preset: ProviderPreset): string | null {
  if (preset.region.field !== undefined) return preset.region.field;
  return preset.fields.some((field) => field.id === "region") ? "region" : null;
}

function regionFromHost(endpoint: string): string | null {
  try {
    return /\b([a-z]{2}-[a-z]+-\d+)\b/.exec(new URL(endpoint).hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The region to sign with, following the preset's RegionSpec rule. */
export function resolveRegion(
  preset: ProviderPreset,
  values: FieldValues,
  endpoint?: string,
): { region: string; needsRegion: boolean } {
  const spec = preset.region;
  const typed = (values.region ?? "").trim();
  const fromField = (id: string | undefined) => (values[id ?? "region"] ?? "").trim();
  switch (spec.rule) {
    case "required":
      return { region: typed, needsRegion: typed === "" };
    case "fixed":
      return { region: spec.value ?? FALLBACK_REGION, needsRegion: false };
    case "equals": {
      const value = fromField(spec.field);
      return { region: value, needsRegion: value === "" };
    }
    case "custom":
    case "optional":
      return { region: firstNonEmpty(typed, spec.default, FALLBACK_REGION), needsRegion: false };
    case "fromEndpoint": {
      const region = firstNonEmpty(typed, endpoint ? regionFromHost(endpoint) : null);
      return { region, needsRegion: region === "" };
    }
  }
}

// ------------------------------------------------------------- addressing

/**
 * Whether requests use path-style addressing. `auto` means path-style for an IP
 * address, localhost, a host with a port, or a bucket name with a dot (a wildcard
 * certificate would not cover it), and virtual-hosted otherwise.
 */
export function resolveAddressing(
  preset: ProviderPreset,
  endpoint: string,
  bucket: string | undefined,
  chosen?: AddressingStyle,
): { style: AddressingStyle; forcePathStyle: boolean } {
  const style = preset.addressingLocked ? preset.addressingStyle : (chosen ?? preset.addressingStyle);
  if (style === "path") return { style, forcePathStyle: true };
  if (style === "virtual") return { style, forcePathStyle: false };
  let path = (bucket ?? "").includes(".");
  try {
    const url = new URL(endpoint);
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith("[");
    path ||= isIp || isLocalHost(url.hostname) || url.port !== "";
  } catch {
    path = true;
  }
  return { style, forcePathStyle: path };
}

// ------------------------------------------------------------ credentials

type Role = "accessKeyId" | "secretAccessKey" | "sessionToken";

function valueForRole(preset: ProviderPreset, values: FieldValues, role: Role): string {
  // A field with that role whose roleWhen holds wins (Supabase session mode), then the field with that id.
  for (const field of preset.fields) {
    if (field.role !== role) continue;
    if (field.roleWhen && (values[field.roleWhen.field] ?? "") !== field.roleWhen.equals) continue;
    if (!isVisible(field, values)) continue;
    const value = (values[field.id] ?? "").trim();
    if (value !== "") return value;
  }
  const own = preset.fields.find((field) => field.id === role && isVisible(field, values));
  if (own) return (values[own.id] ?? "").trim();
  return role === "sessionToken" && preset.sessionToken ? (values[ADVANCED_FIELDS.sessionToken] ?? "").trim() : "";
}

export function credentialsFromValues(preset: ProviderPreset, values: FieldValues): Credentials {
  const sessionToken = valueForRole(preset, values, "sessionToken");
  return {
    accessKeyId: valueForRole(preset, values, "accessKeyId"),
    secretAccessKey: valueForRole(preset, values, "secretAccessKey"),
    ...(sessionToken === "" ? {} : { sessionToken }),
  };
}

/** The expiry (`exp`) of a JWT as an ISO time, or undefined if the token is not a readable JWT. */
export function jwtExpiry(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = atob(payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? new Date(exp * 1000).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * When the session token stops working, if that is known: the "Token expires at"
 * field (or a pasted AWS_CREDENTIAL_EXPIRATION), else the exp claim of a JWT
 * (Supabase). Undefined means unknown, and share links then cap at one hour (C-12).
 */
export function sessionTokenExpiry(values: FieldValues, credentials: Credentials): string | undefined {
  const typed = (values[ADVANCED_FIELDS.sessionTokenExpiresAt] ?? "").trim();
  if (typed !== "") {
    const time = Date.parse(typed);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return credentials.sessionToken ? jwtExpiry(credentials.sessionToken) : undefined;
}

/** The bucket name as the provider knows it (Tencent COS appends `-{appId}`). */
export function effectiveBucket(preset: ProviderPreset, values: FieldValues, bucket: string): string {
  const name = bucket.trim();
  if (name === "" || !preset.bucketSuffix) return name;
  const suffix = preset.bucketSuffix.replace(/\{(\w+)\}/g, (_match, id: string) => (values[id] ?? "").trim());
  return name.endsWith(suffix) ? name : `${name}${suffix}`;
}

// ---------------------------------------------------------------- resolve

export type Problem =
  | ({ kind: "field" } & FieldError)
  | { kind: "endpoint"; problem: EndpointProblem; fieldId: string }
  | { kind: "region"; fieldId: string }
  | { kind: "prefix"; fieldId: string };

export interface ResolvedConnection {
  endpoint: string;
  region: string;
  addressingStyle: AddressingStyle;
  forcePathStyle: boolean;
  /** The bucket as the provider knows it. */
  bucket?: string;
  /** The connection root, empty or ending in "/". */
  prefix: string;
  credentials: Credentials;
  sessionTokenExpiresAt?: string;
  /** The endpoint host does not look like this provider's (a warning, not an error). */
  hostMismatch: boolean;
}

export type ResolveResult = { ok: true; value: ResolvedConnection } | { ok: false; problems: Problem[] };

export interface ResolveOptions {
  bucket?: string;
  addressingStyle?: AddressingStyle;
}

/** Turn a preset and the person's field values into everything a client needs, or list what is wrong. */
export function resolveConnection(
  preset: ProviderPreset,
  values: FieldValues,
  options: ResolveOptions = {},
): ResolveResult {
  const problems: Problem[] = validateFields(preset, values).map((error) => ({ kind: "field", ...error }));

  const regionId = regionFieldId(preset) ?? "region";
  const early = resolveRegion(preset, values);
  const endpointResult = buildEndpoint(preset, values, early.region);
  if (!endpointResult.ok) {
    // A missing field was already reported by validateFields.
    if (endpointResult.problem !== "missing") {
      problems.push({ kind: "endpoint", problem: endpointResult.problem, fieldId: endpointResult.fieldId });
    }
  }
  const endpoint = endpointResult.ok ? endpointResult.endpoint : undefined;
  const { region, needsRegion } = resolveRegion(preset, values, endpoint);
  if (needsRegion && !problems.some((p) => p.kind === "field" && p.fieldId === regionId)) {
    problems.push({ kind: "region", fieldId: regionId });
  }

  const prefix = normalizePrefix(values[ADVANCED_FIELDS.prefix] ?? "");
  if (prefix === null) problems.push({ kind: "prefix", fieldId: ADVANCED_FIELDS.prefix });

  if (problems.length > 0 || endpoint === undefined || prefix === null) return { ok: false, problems };

  const bucket = options.bucket === undefined ? undefined : effectiveBucket(preset, values, options.bucket);
  const addressing = resolveAddressing(preset, endpoint, bucket, options.addressingStyle);
  const credentials = credentialsFromValues(preset, values);
  const expiresAt = sessionTokenExpiry(values, credentials);
  return {
    ok: true,
    value: {
      endpoint,
      region,
      addressingStyle: addressing.style,
      forcePathStyle: addressing.forcePathStyle,
      ...(bucket === undefined || bucket === "" ? {} : { bucket }),
      prefix,
      credentials,
      ...(expiresAt === undefined ? {} : { sessionTokenExpiresAt: expiresAt }),
      hostMismatch: !hostLooksRight(preset, endpoint),
    },
  };
}
