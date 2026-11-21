import type { ProviderPreset } from "@/lib/types";
import type { FieldValues } from "./fields";

export type EndpointProblem = "missing" | "invalid" | "insecure" | "credentials" | "query" | "label";

export type EndpointResult = { ok: true; endpoint: string } | { ok: false; problem: EndpointProblem; fieldId: string };

// One value that is spliced into a host name: letters, digits, dots and hyphens, no slashes or colons.
const HOST_VALUE = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;

/**
 * Where an address sits, as Chrome's Local Network Access sees it: `loopback`
 * (localhost, 127.0.0.0/8, ::1), `local` (private ranges, link-local, .local
 * names) or `public`. Browsers treat loopback as a secure context, so plain http
 * is allowed there; for the other two it is not.
 */
export type AddressSpace = "loopback" | "local" | "public";

function ipv4(hostname: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return null;
  const parts = [1, 2, 3, 4].map((index) => Number(match[index]));
  return parts.every((part) => part <= 255) ? (parts as [number, number, number, number]) : null;
}

export function addressSpaceOf(hostname: string): AddressSpace {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]") return "loopback";
  const v4 = ipv4(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 127) return "loopback";
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return "local";
    if (a === 100 && b >= 64 && b <= 127) return "local";
    return "public";
  }
  if (host.startsWith("[")) {
    const inner = host.slice(1, -1);
    if (inner === "::1") return "loopback";
    if (/^f[cd][0-9a-f]{2}:/.test(inner) || /^fe[89ab][0-9a-f]:/.test(inner)) return "local";
    return "public";
  }
  return host.endsWith(".local") ? "local" : "public";
}

export function isLocalHost(hostname: string): boolean {
  return addressSpaceOf(hostname) === "loopback";
}

/**
 * Check a full endpoint URL: https (http only for localhost), no credentials, no
 * query or fragment. A path is allowed (Supabase has one). Returns it without a trailing slash.
 */
export function normalizeEndpoint(input: string, fieldId = "endpoint"): EndpointResult {
  const text = input.trim();
  if (text === "") return { ok: false, problem: "missing", fieldId };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, problem: "invalid", fieldId };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, problem: "invalid", fieldId };
  if (url.protocol === "http:" && !isLocalHost(url.hostname)) return { ok: false, problem: "insecure", fieldId };
  if (url.username !== "" || url.password !== "") return { ok: false, problem: "credentials", fieldId };
  if (url.search !== "" || url.hash !== "") return { ok: false, problem: "query", fieldId };
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, endpoint: `${url.origin}${path}` };
}

/** The endpoint template for the current values: the base one, or the override picked by a field's value. */
function templateFor(preset: ProviderPreset, values: FieldValues): string | null {
  for (const [fieldId, byValue] of Object.entries(preset.endpointTemplateByField ?? {})) {
    const override = byValue[values[fieldId] ?? ""];
    if (override !== undefined) return override;
  }
  return preset.endpointTemplate;
}

/** Build the endpoint from a preset and its field values. */
export function buildEndpoint(preset: ProviderPreset, values: FieldValues, regionValue: string): EndpointResult {
  const template = templateFor(preset, values);
  if (template === null) return normalizeEndpoint(values.endpoint ?? "");

  let failed: EndpointResult | undefined;
  const filled = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = (name === "region" && !(name in values) ? regionValue : (values[name] ?? "")).trim();
    if (value === "") failed ??= { ok: false, problem: "missing", fieldId: name };
    else if (!HOST_VALUE.test(value)) failed ??= { ok: false, problem: "label", fieldId: name };
    return value;
  });
  return failed ?? normalizeEndpoint(filled);
}

/** True when the endpoint host matches the preset's expectedHostPattern, or the preset has none. */
export function hostLooksRight(preset: ProviderPreset, endpoint: string): boolean {
  if (preset.expectedHostPattern === null) return true;
  try {
    return new RegExp(preset.expectedHostPattern, "i").test(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}
