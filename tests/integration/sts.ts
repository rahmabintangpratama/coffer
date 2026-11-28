import { createHash, createHmac } from "node:crypto";
import { admin, type Credentials, s3Fixture } from "./config";

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * Temporary credentials with a session token from the fixture's STS (`AssumeRole`), signed here with SigV4 so the tests
 * need no STS client. The credentials are fake like every other one in the fixture.
 */
export async function temporaryCredentials(parent: Credentials = admin): Promise<Credentials & { sessionToken: string }> {
  const url = new URL(s3Fixture.endpoint);
  const body = "Action=AssumeRole&Version=2011-06-15&DurationSeconds=3600";
  const date = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const scope = `${date.slice(0, 8)}/${s3Fixture.region}/sts/aws4_request`;
  const signed: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", host: url.host, "x-amz-content-sha256": sha256(body), "x-amz-date": date };
  const names = Object.keys(signed).sort();
  const canonical = ["POST", "/", "", ...names.map((name) => `${name}:${signed[name] ?? ""}`), "", names.join(";"), sha256(body)].join("\n");
  const key = [s3Fixture.region, "sts", "aws4_request"].reduce<Buffer>(hmac, hmac(`AWS4${parent.secretAccessKey}`, date.slice(0, 8)));
  const signature = hmac(key, ["AWS4-HMAC-SHA256", date, scope, sha256(canonical)].join("\n")).toString("hex");
  const headers = Object.fromEntries(Object.entries(signed).filter(([name]) => name !== "host"));
  const response = await fetch(url, { method: "POST", body, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${parent.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` } });
  const xml = await response.text();
  const field = (name: string) => {
    const value = new RegExp(`<${name}>([^<]+)</${name}>`).exec(xml)?.[1];
    if (value === undefined) throw new Error(`STS ${String(response.status)}: no ${name}`);
    return value;
  };
  return { accessKeyId: field("AccessKeyId"), secretAccessKey: field("SecretAccessKey"), sessionToken: field("SessionToken") };
}
