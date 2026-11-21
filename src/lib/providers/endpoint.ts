import type { ProviderPreset } from "@/lib/types";
import type { FieldValues } from "./fields";

export type EndpointProblem = "missing" | "invalid" | "insecure" | "credentials" | "query" | "label";

export type EndpointResult = { ok: true; endpoint: string } | { ok: false; problem: EndpointProblem; fieldId: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// One value that is spliced into a host name: letters, digits, dots and hyphens, no slashes or colons.
const HOST_VALUE = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
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
