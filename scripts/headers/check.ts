import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBase } from "../deploy/base.ts";

/** headers of one path rule, by lower-case name */
export type HeaderRule = Record<string, string>;
export type ParsedHeaders = Record<string, HeaderRule>;

/** Parse a Cloudflare Pages `_headers` file: unindented path lines, indented `Name: value` lines. */
export function parseHeaders(text: string): ParsedHeaders {
  const rules: ParsedHeaders = {};
  let current: HeaderRule | undefined;
  for (const raw of text.split("\n")) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      const path = raw.trim();
      current = rules[path] ?? {};
      rules[path] = current;
      continue;
    }
    if (!current) throw new Error(`Header line before any path: ${raw.trim()}`);
    const colon = raw.indexOf(":");
    if (colon === -1) throw new Error(`Malformed header line: ${raw.trim()}`);
    current[raw.slice(0, colon).trim().toLowerCase()] = raw.slice(colon + 1).trim();
  }
  return rules;
}

/** The Content-Security-Policy from docs/technical-spec.md section 11.2, directive by directive. */
export const EXPECTED_CSP: Record<string, string> = {
  "default-src": "'none'",
  "script-src": "'self'",
  "style-src": "'self'",
  "img-src": "'self' data: blob: https:",
  "media-src": "blob: https:",
  "font-src": "'self'",
  "worker-src": "'self' blob:",
  "manifest-src": "'self'",
  "connect-src": "'self' https: http://localhost:* http://127.0.0.1:*",
  // The sandboxed HTML preview is an srcdoc frame, which frame-src does not govern (D-39); no page may frame anything else.
  "frame-src": "'none'",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'",
  "frame-ancestors": "'none'",
};

const EXPECTED_HEADERS: Record<string, string> = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
};

const EXPECTED_CACHE: Record<string, string> = {
  "/assets/*": "public, max-age=31536000, immutable",
  "/fonts/*": "public, max-age=31536000, immutable",
  "/icons/*": "public, max-age=31536000, immutable",
  "/favicon.svg": "public, max-age=31536000, immutable",
  "/": "no-cache",
  "/index.html": "no-cache",
  "/theme-init.js": "no-cache",
};

function parseCsp(value: string): Map<string, string> {
  const directives = new Map<string, string>();
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const [name = "", ...sources] = trimmed.split(/\s+/);
    directives.set(name, sources.join(" "));
  }
  return directives;
}

/** Returns a list of problems; empty means the file matches the spec. `base` is the path a subpath build is served under. */
export function checkHeaders(rules: ParsedHeaders, base = "/"): string[] {
  const problems: string[] = [];
  const under = (path: string) => `${base}${path.slice(1)}`;
  const all = rules[under("/*")];
  if (!all) return [`Missing the ${under("/*")} rule.`];

  const csp = all["content-security-policy"];
  if (csp === undefined) {
    problems.push("Missing Content-Security-Policy on /*.");
  } else {
    const actual = parseCsp(csp);
    for (const [name, expected] of Object.entries(EXPECTED_CSP)) {
      const got = actual.get(name);
      if (got === undefined) problems.push(`CSP is missing the ${name} directive.`);
      else if (got !== expected) problems.push(`CSP ${name} is "${got}", expected "${expected}".`);
    }
    for (const name of actual.keys()) {
      if (!(name in EXPECTED_CSP)) problems.push(`CSP has an unexpected directive: ${name}.`);
    }
    for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "upgrade-insecure-requests"]) {
      if (csp.includes(forbidden)) problems.push(`CSP must not contain ${forbidden}.`);
    }
  }
  for (const [name, expected] of Object.entries(EXPECTED_HEADERS)) {
    const got = all[name];
    if (got === undefined) problems.push(`Missing header ${name} on /*.`);
    else if (got !== expected) problems.push(`Header ${name} is "${got}", expected "${expected}".`);
  }
  for (const [path, expected] of Object.entries(EXPECTED_CACHE)) {
    const got = rules[under(path)]?.["cache-control"];
    if (got === undefined) problems.push(`Missing Cache-Control rule for ${under(path)}.`);
    else if (got !== expected) problems.push(`Cache-Control for ${under(path)} is "${got}", expected "${expected}".`);
  }
  return problems;
}

/**
 * Paths a live check asks for, relative to the deployment's address, with the rule that must match them. The script's
 * name is found on the page, so a rebuild does not break the check.
 */
async function livePaths(base: URL, fetcher: typeof fetch): Promise<{ url: URL; path: string; rule: string }[]> {
  const page = await fetcher(base);
  const html = page.ok ? await page.text() : "";
  const asset = /["']([^"']*assets\/[^"']+\.js)["']/.exec(html)?.[1];
  const at = (relative: string, rule: string) => {
    const url = new URL(relative, base);
    return { url, path: url.pathname, rule };
  };
  const paths = [
    at("./", "/"),
    at("index.html", "/index.html"),
    at("theme-init.js", "/theme-init.js"),
    at("favicon.svg", "/favicon.svg"),
    at("fonts/ibm-plex-sans-latin-400-normal.woff2", "/fonts/*"),
  ];
  if (asset !== undefined) paths.push(at(asset, "/assets/*"));
  return paths;
}

/** Some hosts answer `index.html` with a redirect to the folder itself, which is checked on its own. */
const redirectsToRoot = (response: Response, url: URL, base: URL): boolean => {
  const location = response.headers.get("location");
  return response.status >= 300 && response.status < 400 && location !== null && new URL(location, url).pathname === base.pathname;
};

/**
 * Check a deployment, not a file: the headers a live URL really sends. Every response must carry the global headers and the
 * exact CSP, and each path its cache rule. A host that drops or rewrites a header (a dashboard rule, a proxy) fails here.
 * `fetcher` is replaced by tests.
 */
export async function checkLive(baseUrl: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const problems: string[] = [];
  // A subpath deployment is given with its path, such as https://example.test/coffer/.
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  let paths: { url: URL; path: string; rule: string }[];
  try {
    paths = await livePaths(base, fetcher);
  } catch (error) {
    return [`Could not reach ${baseUrl}: ${error instanceof Error ? error.message : "unknown error"}.`];
  }
  for (const { url, path, rule } of paths) {
    let response: Response;
    try {
      response = await fetcher(url, { redirect: "manual" });
    } catch (error) {
      problems.push(`${path}: request failed (${error instanceof Error ? error.message : "unknown error"}).`);
      continue;
    }
    if (rule === "/index.html" && redirectsToRoot(response, url, base)) continue;
    if (!response.ok) {
      problems.push(`${path}: status ${response.status.toString()}, expected 200.`);
      continue;
    }
    const csp = response.headers.get("content-security-policy");
    if (csp === null) problems.push(`${path}: missing Content-Security-Policy.`);
    else {
      const actual = parseCsp(csp);
      for (const [name, expected] of Object.entries(EXPECTED_CSP)) {
        const got = actual.get(name);
        if (got === undefined) problems.push(`${path}: CSP is missing ${name}.`);
        else if (got !== expected) problems.push(`${path}: CSP ${name} is "${got}", expected "${expected}".`);
      }
      for (const name of actual.keys()) if (!(name in EXPECTED_CSP)) problems.push(`${path}: CSP has an unexpected directive: ${name}.`);
      for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "upgrade-insecure-requests"]) {
        if (csp.includes(forbidden)) problems.push(`${path}: CSP must not contain ${forbidden}.`);
      }
    }
    for (const [name, expected] of Object.entries(EXPECTED_HEADERS)) {
      const got = response.headers.get(name);
      if (got === null) problems.push(`${path}: missing header ${name}.`);
      else if (got !== expected) problems.push(`${path}: header ${name} is "${got}", expected "${expected}".`);
    }
    const cache = response.headers.get("cache-control");
    const expectedCache = EXPECTED_CACHE[rule];
    if (expectedCache !== undefined) {
      if (cache === null) problems.push(`${path}: missing Cache-Control.`);
      else if (cache !== expectedCache) problems.push(`${path}: Cache-Control is "${cache}", expected "${expectedCache}".`);
    }
  }
  return problems;
}

async function mainLive(url: string): Promise<void> {
  const problems = await checkLive(url);
  if (problems.length === 0) {
    console.log(`${url}: OK (headers match the spec on every path checked)`);
    return;
  }
  for (const problem of problems) console.error(`${url}: ${problem}`);
  process.exit(1);
}

function main(): void {
  const urlFlag = process.argv.indexOf("--url");
  if (urlFlag !== -1) {
    const url = process.argv[urlFlag + 1];
    if (url === undefined || !/^https?:\/\//.test(url)) {
      console.error("Usage: pnpm headers:check --url https://your-site.pages.dev");
      process.exit(1);
    }
    void mainLive(url);
    return;
  }
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const targets = process.argv.slice(2);
  const files = targets.length > 0 ? targets : [join(repo, "public", "_headers"), join(repo, "dist", "_headers")];
  // The built copy of a subpath build carries the base in its paths; the committed one never does.
  const built = join(repo, "dist", "_headers");
  const base = normalizeBase(process.env.COFFER_BASE);
  let failed = false;
  let checked = 0;
  for (const file of files) {
    if (!existsSync(file)) {
      if (targets.length > 0) {
        console.error(`Not found: ${file}`);
        failed = true;
      }
      continue;
    }
    checked += 1;
    const problems = checkHeaders(parseHeaders(readFileSync(file, "utf8")), file === built || targets.length > 0 ? base : "/");
    const name = relative(repo, file);
    if (problems.length === 0) {
      console.log(`${name}: OK`);
    } else {
      failed = true;
      for (const problem of problems) console.error(`${name}: ${problem}`);
    }
  }
  if (checked === 0) failed = true;
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
