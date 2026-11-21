// @vitest-environment node
import { describe, expect, it } from "vitest";
import { presetCases } from "../../../tests/fixtures/preset-cases";
import type { ProvidersFile } from "@/lib/types";
import {
  ADVANCED_FIELDS,
  buildEndpoint,
  credentialsFromValues,
  getPreset,
  hostLooksRight,
  jwtExpiry,
  normalizeEndpoint,
  normalizePrefix,
  providersFile,
  resolveAddressing,
  resolveConnection,
  sessionTokenExpiry,
  validateFields,
  validateProvidersFile,
  visibleFields,
} from "./index";

const jwt = (payload: object) =>
  `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}.sig`;

describe("the presets in design/providers.json", () => {
  it("pass the cross-checks (placeholders, field ids, regular expressions, groups, roles)", () => {
    expect(validateProvidersFile(providersFile)).toEqual([]);
    expect(providersFile.providers).toHaveLength(21);
  });

  it("have a worked example for every preset", () => {
    const covered = new Set(presetCases.map((entry) => entry.id));
    expect(providersFile.providers.filter((preset) => !covered.has(preset.id)).map((preset) => preset.id)).toEqual([]);
  });

  it.each(presetCases)("$label resolves to the expected connection", ({ id, values, bucket, expected }) => {
    const result = resolveConnection(getPreset(id), values, bucket === undefined ? {} : { bucket });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.endpoint).toBe(expected.endpoint);
    expect(result.value.region).toBe(expected.region);
    expect(result.value.forcePathStyle).toBe(expected.forcePathStyle);
    expect(result.value.bucket).toBe(expected.bucket);
    expect(result.value.hostMismatch).toBe(false);
    expect(result.value.credentials.accessKeyId).toBe(values.accessKeyId);
    expect(result.value.credentials.secretAccessKey).toBe(values.secretAccessKey);
  });
});

describe("validateProvidersFile catches a bad preset", () => {
  const clone = () => structuredClone(providersFile);
  const withPreset = (change: (preset: ProvidersFile["providers"][number]) => void) => {
    const file = clone();
    const preset = file.providers[0];
    if (!preset) throw new Error("no preset");
    change(preset);
    return validateProvidersFile(file).join("\n");
  };

  it("an unknown template placeholder", () => {
    expect(withPreset((p) => (p.endpointTemplate = "https://{nope}.example.com"))).toContain("{nope} is not a field");
  });
  it("a showWhen that names no field", () => {
    expect(withPreset((p) => (p.fields[0] = { ...(p.fields[0] ?? ({} as never)), showWhen: { field: "ghost", equals: "x" } }))).toContain('unknown field "ghost"');
  });
  it("a regular expression that does not compile", () => {
    expect(withPreset((p) => (p.expectedHostPattern = "(["))).toContain("expectedHostPattern does not compile");
  });
  it("an endpoint pattern group that is not a field", () => {
    expect(withPreset((p) => (p.pasteHints.endpointPattern = "^https://(?<ghost>[a-z]+)\\.example\\.com$"))).toContain("(?<ghost>)");
  });
  it("an unknown group and a duplicate popularOrder", () => {
    expect(withPreset((p) => (p.group = "nowhere" as never))).toContain('unknown group "nowhere"');
    const file = clone();
    const popular = file.providers.filter((p) => p.popular);
    if (popular[0] && popular[1]) popular[1].popularOrder = popular[0].popularOrder;
    expect(validateProvidersFile(file).join("\n")).toContain("popularOrder is not unique");
  });
  it("a preset with no way to get the secret", () => {
    expect(withPreset((p) => (p.fields = p.fields.filter((field) => field.id !== "secretAccessKey")))).toContain("nothing supplies the secretAccessKey");
  });
});

describe("field rules", () => {
  it("reports missing required fields and skips fields that are hidden", () => {
    const supabase = getPreset("supabase");
    const keysMode = validateFields(supabase, { authMode: "keys" }).map((e) => e.fieldId);
    expect(keysMode).toContain("accessKeyId");
    expect(keysMode).not.toContain("publishableKey");
    const sessionMode = validateFields(supabase, { authMode: "session" }).map((e) => e.fieldId);
    expect(sessionMode).toContain("publishableKey");
    expect(sessionMode).not.toContain("accessKeyId");
    expect(visibleFields(supabase, { authMode: "session" }).map((f) => f.id)).toContain("sessionToken");
  });

  it("applies the provider's own pattern, length and prefix rules with its message", () => {
    expect(validateFields(getPreset("cloudflare-r2"), { accountId: "xyz", jurisdiction: "default", accessKeyId: "a", secretAccessKey: "b" })[0]).toMatchObject({
      fieldId: "accountId",
      rule: "pattern",
      message: "Account ID is 32 lowercase hex characters.",
    });
    expect(validateFields(getPreset("tigris"), { accessKeyId: "abc", secretAccessKey: "tsec_x" })[0]).toMatchObject({ fieldId: "accessKeyId", rule: "prefix" });
    expect(validateFields(getPreset("tencent-cos"), { appId: "1250000000", region: "ap-guangzhou", accessKeyId: "short", secretAccessKey: "x".repeat(32) })[0]).toMatchObject({
      fieldId: "accessKeyId",
      rule: "length",
    });
  });

  it("normalizes the start folder", () => {
    expect(normalizePrefix("")).toBe("");
    expect(normalizePrefix("/")).toBe("");
    expect(normalizePrefix("a//b")).toBe("a/b/");
    expect(normalizePrefix("  exports/2026  ")).toBe("exports/2026/");
    expect(normalizePrefix("../secret")).toBeNull();
    expect(normalizePrefix("a/./b")).toBeNull();
  });
});

describe("endpoints", () => {
  it("accepts https and local http, and trims a trailing slash", () => {
    expect(normalizeEndpoint("https://s3.example.com/")).toEqual({ ok: true, endpoint: "https://s3.example.com" });
    expect(normalizeEndpoint("http://localhost:9000")).toEqual({ ok: true, endpoint: "http://localhost:9000" });
    expect(normalizeEndpoint("http://127.0.0.1:9000/")).toEqual({ ok: true, endpoint: "http://127.0.0.1:9000" });
    expect(normalizeEndpoint("https://x.storage.example.com/storage/v1/s3")).toEqual({ ok: true, endpoint: "https://x.storage.example.com/storage/v1/s3" });
  });

  it.each([
    ["http://s3.example.com", "insecure"],
    ["https://user:pass@s3.example.com", "credentials"],
    ["https://s3.example.com/?x=1", "query"],
    ["https://s3.example.com/#frag", "query"],
    ["ftp://s3.example.com", "invalid"],
    ["not a url", "invalid"],
    ["", "missing"],
  ])("rejects %s as %s", (input, problem) => {
    expect(normalizeEndpoint(input)).toMatchObject({ ok: false, problem });
  });

  it("rejects a field value that would change the host", () => {
    const aws = getPreset("aws-s3");
    for (const region of ["evil.com/x", "a@b", "us:443", "a b"]) {
      expect(buildEndpoint(aws, { region }, region)).toMatchObject({ ok: false, problem: "label" });
    }
  });

  it("warns when the host does not look like the provider's", () => {
    const r2 = getPreset("cloudflare-r2");
    expect(hostLooksRight(r2, `https://${"a".repeat(32)}.r2.cloudflarestorage.com`)).toBe(true);
    expect(hostLooksRight(r2, "https://r2.example.com")).toBe(false);
    expect(hostLooksRight(getPreset("custom"), "https://anything.example.com")).toBe(true);
    const result = resolveConnection(getPreset("minio"), { endpoint: "http://localhost:9000", accessKeyId: "a", secretAccessKey: "b" });
    expect(result.ok && result.value.hostMismatch).toBe(false);
  });

  it("flags an http endpoint that is not local when resolving", () => {
    const result = resolveConnection(getPreset("custom"), { endpoint: "http://s3.example.com", accessKeyId: "a", secretAccessKey: "b" });
    expect(result).toMatchObject({ ok: false, problems: [{ kind: "endpoint", problem: "insecure", fieldId: "endpoint" }] });
  });
});

describe("addressing", () => {
  const custom = getPreset("custom");
  it("uses path style for an IP, localhost, a port or a dotted bucket, and virtual-hosted otherwise", () => {
    expect(resolveAddressing(custom, "https://s3.example.com", "data").forcePathStyle).toBe(false);
    expect(resolveAddressing(custom, "https://10.0.0.5", "data").forcePathStyle).toBe(true);
    expect(resolveAddressing(custom, "http://localhost:9000", "data").forcePathStyle).toBe(true);
    expect(resolveAddressing(custom, "https://s3.example.com:8443", "data").forcePathStyle).toBe(true);
    expect(resolveAddressing(custom, "https://s3.example.com", "my.dotted.bucket").forcePathStyle).toBe(true);
  });

  it("honours an explicit choice, except where the provider locks it", () => {
    expect(resolveAddressing(custom, "https://s3.example.com", "data", "path").forcePathStyle).toBe(true);
    expect(resolveAddressing(custom, "http://localhost:9000", "data", "virtual").forcePathStyle).toBe(false);
    const alibaba = getPreset("alibaba-oss");
    expect(resolveAddressing(alibaba, "https://s3.oss-cn-hangzhou.aliyuncs.com", "b", "path")).toEqual({ style: "virtual", forcePathStyle: false });
  });
});

describe("regions", () => {
  it("asks for the region where it cannot be known", () => {
    const aws = resolveConnection(getPreset("aws-s3"), { accessKeyId: "a", secretAccessKey: "b" });
    expect(aws.ok).toBe(false);
    const idrive = resolveConnection(getPreset("idrive-e2"), { endpoint: "https://e2.example.com", accessKeyId: "a", secretAccessKey: "b" });
    expect(idrive).toMatchObject({ ok: false, problems: [{ kind: "region" }] });
    const typed = resolveConnection(getPreset("idrive-e2"), { endpoint: "https://e2.example.com", region: "eu-west-1", accessKeyId: "a", secretAccessKey: "b" });
    expect(typed.ok && typed.value.region).toBe("eu-west-1");
  });

  it("lets a typed region override the default for custom endpoints", () => {
    const result = resolveConnection(getPreset("custom"), { endpoint: "https://s3.example.com", region: "eu-1", accessKeyId: "a", secretAccessKey: "b" });
    expect(result.ok && result.value.region).toBe("eu-1");
  });
});

describe("credentials and the session token", () => {
  it("maps Supabase session mode to project ref, publishable key and token", () => {
    const supabase = getPreset("supabase");
    const credentials = credentialsFromValues(supabase, {
      authMode: "session",
      projectRef: "abcdefghijklmnopqrst",
      publishableKey: "pk_example",
      sessionToken: "jwt-value",
    });
    expect(credentials).toEqual({ accessKeyId: "abcdefghijklmnopqrst", secretAccessKey: "pk_example", sessionToken: "jwt-value" });
    expect(credentialsFromValues(supabase, { authMode: "keys", accessKeyId: "AK", secretAccessKey: "SK" })).toEqual({ accessKeyId: "AK", secretAccessKey: "SK" });
  });

  it("takes a generic session token only for presets that support one", () => {
    const withToken = credentialsFromValues(getPreset("aws-s3"), { accessKeyId: "a", secretAccessKey: "b", sessionToken: "t" });
    expect(withToken.sessionToken).toBe("t");
    expect(credentialsFromValues(getPreset("backblaze-b2"), { accessKeyId: "a", secretAccessKey: "b", sessionToken: "t" }).sessionToken).toBeUndefined();
  });

  it("reads the expiry from the field, a pasted time or the JWT exp claim, in that order", () => {
    const token = jwt({ exp: 1_900_000_000 });
    expect(jwtExpiry(token)).toBe("2030-03-17T17:46:40.000Z");
    expect(jwtExpiry("not.a.jwt")).toBeUndefined();
    expect(jwtExpiry(jwt({ exp: "soon" }))).toBeUndefined();
    const credentials = { accessKeyId: "a", secretAccessKey: "b", sessionToken: token };
    expect(sessionTokenExpiry({}, credentials)).toBe("2030-03-17T17:46:40.000Z");
    expect(sessionTokenExpiry({ [ADVANCED_FIELDS.sessionTokenExpiresAt]: "2031-01-01T00:00:00Z" }, credentials)).toBe("2031-01-01T00:00:00.000Z");
    expect(sessionTokenExpiry({ [ADVANCED_FIELDS.sessionTokenExpiresAt]: "garbage" }, credentials)).toBe("2030-03-17T17:46:40.000Z");
    expect(sessionTokenExpiry({}, { accessKeyId: "a", secretAccessKey: "b", sessionToken: "opaque" })).toBeUndefined();
    expect(sessionTokenExpiry({}, { accessKeyId: "a", secretAccessKey: "b" })).toBeUndefined();
  });

  it("carries the start folder and expiry into the resolved connection", () => {
    const result = resolveConnection(getPreset("supabase"), {
      projectRef: "abcdefghijklmnopqrst",
      region: "eu-central-1",
      authMode: "session",
      publishableKey: "pk",
      sessionToken: jwt({ exp: 1_900_000_000 }),
      [ADVANCED_FIELDS.prefix]: "/exports//2026",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prefix).toBe("exports/2026/");
    expect(result.value.sessionTokenExpiresAt).toBe("2030-03-17T17:46:40.000Z");
  });

  it("rejects a start folder with a relative segment", () => {
    const result = resolveConnection(getPreset("custom"), { endpoint: "https://s3.example.com", accessKeyId: "a", secretAccessKey: "b", [ADVANCED_FIELDS.prefix]: "../x" });
    expect(result).toMatchObject({ ok: false, problems: [{ kind: "prefix" }] });
  });
});
