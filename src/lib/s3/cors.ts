export interface CorsRule {
  AllowedOrigins: string[];
  AllowedMethods: string[];
  AllowedHeaders: string[];
  ExposeHeaders: string[];
  MaxAgeSeconds: number;
}

const METHODS = ["GET", "PUT", "POST", "DELETE", "HEAD"];
// ETag is needed to finish multipart uploads, Date to measure clock skew, and
// x-amz-bucket-region to suggest the right region. The rest help ranged reads.
const EXPOSE = ["ETag", "Date", "x-amz-request-id", "x-amz-bucket-region", "Content-Length", "Content-Range", "Accept-Ranges"];

/** The origin must be exactly scheme, host and port: never `*`, never a path. */
function checkedOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("The CORS origin must be a full origin such as https://app.example.com.");
  }
  if (origin === "*" || url.origin !== origin) {
    throw new Error("The CORS origin must be a single origin (scheme, host and port), without a path.");
  }
  return origin;
}

/** The rule Coffer asks the person to add: only this app's origin is allowed. */
export function corsRule(origin: string): CorsRule {
  return {
    AllowedOrigins: [checkedOrigin(origin)],
    AllowedMethods: [...METHODS],
    AllowedHeaders: ["*"],
    ExposeHeaders: [...EXPOSE],
    MaxAgeSeconds: 3600,
  };
}

/** The rule as the JSON most consoles accept. */
export function corsJson(origin: string): string {
  return JSON.stringify([corsRule(origin)], null, 2);
}

const escapeXml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

/** The same rule as an S3 CORSConfiguration document. */
export function corsXml(origin: string): string {
  const rule = corsRule(origin);
  const lines = (tag: string, values: string[]) => values.map((value) => `    <${tag}>${escapeXml(value)}</${tag}>`);
  return [
    "<CORSConfiguration>",
    "  <CORSRule>",
    ...lines("AllowedOrigin", rule.AllowedOrigins),
    ...lines("AllowedMethod", rule.AllowedMethods),
    ...lines("AllowedHeader", rule.AllowedHeaders),
    ...lines("ExposeHeader", rule.ExposeHeaders),
    `    <MaxAgeSeconds>${rule.MaxAgeSeconds}</MaxAgeSeconds>`,
    "  </CORSRule>",
    "</CORSConfiguration>",
  ].join("\n");
}
