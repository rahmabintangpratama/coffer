import { describe, expect, it } from "vitest";
import { getPreset } from "@/lib/providers";
import { describeProblems, optionLabel, planOf, withoutSecrets } from "./form-model";

describe("withoutSecrets (FR-3: keys never leave the form except into the vault)", () => {
  it("drops the access key, the secret and the session token", () => {
    const preset = getPreset("cloudflare-r2");
    const values = { accountId: "a".repeat(32), jurisdiction: "eu", accessKeyId: "id", secretAccessKey: "secret", sessionToken: "token", prefix: "photos/" };
    expect(withoutSecrets(preset, values)).toEqual({ accountId: "a".repeat(32), jurisdiction: "eu", prefix: "photos/" });
  });

  it("also drops Supabase's publishable key and token, which have roles instead of the usual ids", () => {
    const preset = getPreset("supabase");
    const kept = withoutSecrets(preset, { projectRef: "a".repeat(20), authMode: "session", publishableKey: "pk", sessionToken: "jwt", region: "eu-central-1" });
    // The project ref is the access key id in session mode, so it counts as a key too.
    expect(kept).toEqual({ authMode: "session", region: "eu-central-1" });
  });
});

describe("describeProblems", () => {
  const preset = getPreset("cloudflare-r2");

  it("says which field is required, and uses the provider's own message for a bad value", () => {
    const problems = describeProblems(preset, [
      { kind: "field", fieldId: "accessKeyId", rule: "required", message: "" },
      { kind: "field", fieldId: "accountId", rule: "pattern", message: "Account ID is 32 lowercase hex characters." },
    ]);
    expect(problems).toEqual([
      { target: "accessKeyId", text: "Access Key ID is required." },
      { target: "accountId", text: "Account ID is 32 lowercase hex characters." },
    ]);
  });

  it("marks an http endpoint on an https page so the form can show the ob.fail.net wording (AC-3.8)", () => {
    const [problem] = describeProblems(getPreset("custom"), [{ kind: "endpoint", problem: "insecure", fieldId: "endpoint" }]);
    expect(problem?.insecure).toBe(true);
    expect(problem?.target).toBe("endpoint");
  });

  it("puts an endpoint problem under the preview when the template field is not a form field", () => {
    const [problem] = describeProblems(preset, [{ kind: "endpoint", problem: "label", fieldId: "bucketHost" }]);
    expect(problem?.target).toBe("endpoint");
  });
});

describe("optionLabel", () => {
  it("uses the copy for known options and the value otherwise", () => {
    const supabase = getPreset("supabase").fields.find((field) => field.id === "authMode");
    const jurisdiction = getPreset("cloudflare-r2").fields.find((field) => field.id === "jurisdiction");
    if (!supabase || !jurisdiction) throw new Error("fixture fields missing");
    expect(optionLabel(supabase, "session")).toBe("Session token");
    expect(optionLabel(supabase, "keys")).toBe("S3 keys");
    expect(optionLabel(jurisdiction, "eu")).toBe("EU");
    expect(optionLabel(jurisdiction, "default")).toBe("Default");
    const region = getPreset("aws-s3").fields.find((field) => field.id === "region");
    if (!region) throw new Error("fixture field missing");
    expect(optionLabel(region, "us-east-1")).toBe("us-east-1");
  });
});

describe("planOf", () => {
  it("carries everything but the keys", () => {
    const plan = planOf({
      endpoint: "https://x.example",
      region: "auto",
      addressingStyle: "path",
      forcePathStyle: true,
      prefix: "",
      credentials: { accessKeyId: "id", secretAccessKey: "secret" },
      hostMismatch: false,
    });
    expect(JSON.stringify(plan)).not.toContain("secret");
    expect(plan.endpoint).toBe("https://x.example");
  });
});
