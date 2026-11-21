import type { ProviderPreset } from "@/lib/types";
import { regionFieldId } from "./connection";
import { ADVANCED_FIELDS } from "./fields";

export interface PasteResult {
  /** Field id to value. Never contains an empty value. */
  fields: Record<string, string>;
  /** Field ids that were filled, in the order they were found, for the "detected" marker. */
  detected: string[];
  /** An rclone block named a different provider than the preset expects. */
  rcloneProviderMismatch: boolean;
  /** A pasted AWS_CREDENTIAL_EXPIRATION was not a future time and was ignored. */
  expirationIgnored: boolean;
}

const ENV_LINE = /^(?:export\s+)?([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const URL_ONLY = /^https?:\/\/\S+$/i;

function unquote(value: string): string {
  const text = value.trim();
  if (text.length >= 2 && (text.startsWith('"') || text.startsWith("'")) && text.endsWith(text[0] ?? "")) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Fill a connection form from pasted text: AWS-style environment lines, an
 * rclone remote block, or a bare endpoint. The text is parsed and then forgotten;
 * it is never logged or stored.
 */
export function parsePaste(text: string, preset: ProviderPreset, now: Date = new Date()): PasteResult {
  const result: PasteResult = { fields: {}, detected: [], rcloneProviderMismatch: false, expirationIgnored: false };
  const set = (fieldId: string, value: string) => {
    const clean = value.trim();
    if (clean === "") return;
    result.fields[fieldId] = clean;
    if (!result.detected.includes(fieldId)) result.detected.push(fieldId);
  };

  const hasField = (id: string) => preset.fields.some((field) => field.id === id);
  const setSessionToken = (value: string) => {
    if (preset.sessionToken) set(ADVANCED_FIELDS.sessionToken, value);
  };
  const setRegion = (value: string) => {
    const id = regionFieldId(preset);
    if (id !== null) set(id, value);
  };

  /** A full endpoint URL: named groups of the preset's pattern fill fields; otherwise it is the endpoint field. */
  const setEndpoint = (url: string) => {
    const pattern = preset.pasteHints.endpointPattern;
    if (pattern !== null) {
      const match = new RegExp(pattern, "i").exec(url.trim());
      if (match) {
        const defaults = preset.pasteHints.endpointPatternDefaults ?? {};
        for (const id of [...pattern.matchAll(/\(\?<(\w+)>/g)].map((m) => m[1] ?? "")) {
          if (hasField(id)) set(id, match.groups?.[id] ?? defaults[id] ?? "");
        }
        return;
      }
    }
    if (hasField("endpoint")) set("endpoint", url);
  };

  const setExpiration = (value: string) => {
    if (!preset.sessionToken) return;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > now.getTime()) set(ADVANCED_FIELDS.sessionTokenExpiresAt, new Date(time).toISOString());
    else result.expirationIgnored = true;
  };

  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith(";"));

  if (lines.length === 1 && URL_ONLY.test(lines[0] ?? "")) {
    setEndpoint(lines[0] ?? "");
    return result;
  }

  if (/^\[[^\]]+\]$/.test(lines[0] ?? "")) {
    // rclone remote: key = value lines under [name].
    const keys = preset.pasteHints.rcloneKeys;
    const wanted = (fieldId: string) => keys[fieldId];
    const values = new Map<string, string>();
    for (const line of lines.slice(1)) {
      const at = line.indexOf("=");
      if (at > 0) values.set(line.slice(0, at).trim(), unquote(line.slice(at + 1)));
    }
    const read = (fieldId: string) => {
      const key = wanted(fieldId);
      return key === undefined ? undefined : values.get(key);
    };
    set("accessKeyId", read("accessKeyId") ?? "");
    set("secretAccessKey", read("secretAccessKey") ?? "");
    const token = read("sessionToken");
    if (token !== undefined) setSessionToken(token);
    const endpoint = read("endpoint");
    if (endpoint !== undefined) setEndpoint(endpoint);
    const region = read("region");
    if (region !== undefined) setRegion(region);
    const provider = values.get("provider");
    const expected = preset.pasteHints.rcloneProviderValue;
    result.rcloneProviderMismatch = provider !== undefined && expected !== null && expected !== undefined && provider.toLowerCase() !== expected.toLowerCase();
    return result;
  }

  // Environment lines. Only names listed in the preset's hints count, and the
  // service-specific endpoint and the AWS_REGION name win over the generic ones.
  const known = new Set(preset.pasteHints.envVars);
  const env = new Map<string, string>();
  for (const line of lines) {
    const match = ENV_LINE.exec(line);
    if (match?.[1] !== undefined) env.set(match[1], unquote(match[2] ?? ""));
  }
  const pick = (...names: string[]) => {
    for (const name of names) if (known.has(name) && env.has(name)) return env.get(name);
    return undefined;
  };
  set("accessKeyId", pick("AWS_ACCESS_KEY_ID") ?? "");
  set("secretAccessKey", pick("AWS_SECRET_ACCESS_KEY") ?? "");
  const token = pick("AWS_SESSION_TOKEN");
  if (token !== undefined) setSessionToken(token);
  const endpoint = pick("AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL");
  if (endpoint !== undefined) setEndpoint(endpoint);
  const region = pick("AWS_REGION", "AWS_DEFAULT_REGION");
  if (region !== undefined) setRegion(region);
  // AWS_CREDENTIAL_EXPIRATION is read for every preset that takes a session token (C-12).
  const expiration = env.get("AWS_CREDENTIAL_EXPIRATION");
  if (expiration !== undefined) setExpiration(expiration);
  return result;
}
