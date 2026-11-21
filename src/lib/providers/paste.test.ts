// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getPreset, parsePaste } from "./index";

const NOW = new Date("2026-11-21T12:00:00Z");
const FUTURE = "2026-11-21T13:00:00Z";
const PAST = "2026-11-21T11:00:00Z";

describe("pasted environment lines", () => {
  it("fills the keys, endpoint and region and marks them detected", () => {
    const text = [
      "# my bucket",
      "export AWS_ACCESS_KEY_ID=AKIAEXAMPLEKEY",
      'AWS_SECRET_ACCESS_KEY="example-secret"',
      "AWS_REGION='eu-west-1'",
    ].join("\n");
    const result = parsePaste(text, getPreset("aws-s3"), NOW);
    expect(result.fields).toEqual({ accessKeyId: "AKIAEXAMPLEKEY", secretAccessKey: "example-secret", region: "eu-west-1" });
    expect(result.detected).toEqual(["accessKeyId", "secretAccessKey", "region"]);
  });

  it("handles Windows line endings", () => {
    const result = parsePaste("AWS_ACCESS_KEY_ID=A1\r\nAWS_SECRET_ACCESS_KEY=S1\r\n", getPreset("aws-s3"), NOW);
    expect(result.fields).toEqual({ accessKeyId: "A1", secretAccessKey: "S1" });
  });

  it("prefers the S3 endpoint and AWS_REGION over the generic names", () => {
    const text = [
      "AWS_ENDPOINT_URL=https://generic.example.com",
      "AWS_ENDPOINT_URL_S3=https://s3.example.com",
      "AWS_DEFAULT_REGION=us-west-1",
      "AWS_REGION=eu-1",
    ].join("\n");
    const result = parsePaste(text, getPreset("custom"), NOW);
    expect(result.fields.endpoint).toBe("https://s3.example.com");
    expect(result.fields.region).toBe("eu-1");
  });

  it("fills the session token and a future expiration", () => {
    const text = `AWS_ACCESS_KEY_ID=A\nAWS_SECRET_ACCESS_KEY=S\nAWS_SESSION_TOKEN=tok\nAWS_CREDENTIAL_EXPIRATION=${FUTURE}`;
    const result = parsePaste(text, getPreset("aws-s3"), NOW);
    expect(result.fields.sessionToken).toBe("tok");
    expect(result.fields.sessionTokenExpiresAt).toBe("2026-11-21T13:00:00.000Z");
    expect(result.detected).toEqual(["accessKeyId", "secretAccessKey", "sessionToken", "sessionTokenExpiresAt"]);
    expect(result.expirationIgnored).toBe(false);
  });

  it.each([PAST, "not a date"])("ignores the expiration %s with a flag", (expiration) => {
    const result = parsePaste(`AWS_SESSION_TOKEN=tok\nAWS_CREDENTIAL_EXPIRATION=${expiration}`, getPreset("aws-s3"), NOW);
    expect(result.fields.sessionTokenExpiresAt).toBeUndefined();
    expect(result.expirationIgnored).toBe(true);
  });

  it("leaves out a token and expiration for a provider that does not take session tokens", () => {
    const result = parsePaste(`AWS_ACCESS_KEY_ID=A\nAWS_SESSION_TOKEN=tok\nAWS_CREDENTIAL_EXPIRATION=${FUTURE}`, getPreset("backblaze-b2"), NOW);
    expect(Object.keys(result.fields)).toEqual(["accessKeyId"]);
    expect(result.expirationIgnored).toBe(false);
  });
});

describe("pasted rclone remote", () => {
  const block = (provider: string) =>
    ["[r2]", "type = s3", `provider = ${provider}`, "access_key_id = AKR2", "secret_access_key = SKR2", `endpoint = https://${"a".repeat(32)}.eu.r2.cloudflarestorage.com`, "region = auto"].join("\n");

  it("fills the keys and splits the endpoint into account and jurisdiction", () => {
    const result = parsePaste(block("Cloudflare"), getPreset("cloudflare-r2"), NOW);
    expect(result.fields).toMatchObject({ accessKeyId: "AKR2", secretAccessKey: "SKR2", accountId: "a".repeat(32), jurisdiction: "eu" });
    expect(result.rcloneProviderMismatch).toBe(false);
  });

  it("still parses a block for another provider but says so", () => {
    const result = parsePaste(block("AWS"), getPreset("cloudflare-r2"), NOW);
    expect(result.fields.accessKeyId).toBe("AKR2");
    expect(result.rcloneProviderMismatch).toBe(true);
  });

  it("reads a session token and region where the preset has them", () => {
    const text = "[s3]\nprovider = AWS\naccess_key_id = A\nsecret_access_key = S\nsession_token = T\nregion = eu-west-1";
    const result = parsePaste(text, getPreset("aws-s3"), NOW);
    expect(result.fields).toMatchObject({ sessionToken: "T", region: "eu-west-1" });
  });
});

describe("a pasted endpoint", () => {
  it("uses the preset's pattern groups, with its defaults for groups that did not match", () => {
    const id = "b".repeat(32);
    expect(parsePaste(`https://${id}.r2.cloudflarestorage.com`, getPreset("cloudflare-r2"), NOW).fields).toEqual({ accountId: id, jurisdiction: "default" });
    expect(parsePaste(`https://${id}.fedramp.r2.cloudflarestorage.com/`, getPreset("cloudflare-r2"), NOW).fields).toEqual({ accountId: id, jurisdiction: "fedramp" });
    expect(parsePaste("https://s3.eu-central-003.backblazeb2.com", getPreset("backblaze-b2"), NOW).fields).toEqual({ region: "eu-central-003" });
  });

  it("fills the endpoint field for a preset without a pattern", () => {
    expect(parsePaste("https://s3.example.com", getPreset("custom"), NOW).fields).toEqual({ endpoint: "https://s3.example.com" });
    expect(parsePaste("http://localhost:9000", getPreset("minio"), NOW).detected).toEqual(["endpoint"]);
  });

  it("fills nothing for an address that does not match the provider", () => {
    expect(parsePaste("https://example.com", getPreset("backblaze-b2"), NOW).detected).toEqual([]);
  });
});

describe("text that is not a connection", () => {
  it.each(["", "hello world", "key: value", "AWS_ACCESS_KEY_ID", "# only a comment"])("changes nothing for %j", (text) => {
    const result = parsePaste(text, getPreset("aws-s3"), NOW);
    expect(result.fields).toEqual({});
    expect(result.detected).toEqual([]);
  });

  it("ignores environment names that are not in the preset's hints", () => {
    expect(parsePaste("SOMETHING_ELSE=1\nHOME=/root", getPreset("aws-s3"), NOW).detected).toEqual([]);
  });

  it("does not return the pasted text anywhere in the result", () => {
    const secret = "ZZ-very-secret-ZZ";
    const result = parsePaste(`AWS_SECRET_ACCESS_KEY=${secret}`, getPreset("aws-s3"), NOW);
    expect(Object.keys(result)).toEqual(["fields", "detected", "rcloneProviderMismatch", "expirationIgnored"]);
    expect(result.detected).toEqual(["secretAccessKey"]);
  });
});
