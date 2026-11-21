import { createHash, createHmac } from "node:crypto";
import { type Credentials, s3Fixture } from "./config";

// Minimal client for RustFS's admin API (users and policies), signed with
// SigV4. RustFS accepts plain JSON bodies. This is test tooling only.
const ADMIN = "/rustfs/admin/v3";

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

export async function adminRequest(
  creds: Credentials,
  method: "GET" | "PUT",
  action: string,
  query: Record<string, string> = {},
  body = "",
): Promise<{ status: number; text: string }> {
  const url = new URL(`${s3Fixture.endpoint}${ADMIN}/${action}`);
  const queryString = Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key] ?? "")}`)
    .join("&");
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": sha256(body),
    "x-amz-date": amzDate,
    ...(body === "" ? {} : { "content-type": "application/json" }),
  };
  const names = Object.keys(headers).sort();
  const canonical = [
    method,
    url.pathname,
    queryString,
    names.map((name) => `${name}:${headers[name] ?? ""}\n`).join(""),
    names.join(";"),
    sha256(body),
  ].join("\n");
  const scope = `${day}/${s3Fixture.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), s3Fixture.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;

  const response = await fetch(`${url.origin}${url.pathname}${queryString === "" ? "" : `?${queryString}`}`, {
    method,
    headers,
    ...(body === "" ? {} : { body }),
  });
  return { status: response.status, text: await response.text() };
}

export async function adminOk(
  creds: Credentials,
  method: "GET" | "PUT",
  action: string,
  query?: Record<string, string>,
  body?: string,
): Promise<void> {
  const { status, text } = await adminRequest(creds, method, action, query, body);
  if (status !== 200) throw new Error(`RustFS admin ${action} failed: ${status} ${text}`);
}
