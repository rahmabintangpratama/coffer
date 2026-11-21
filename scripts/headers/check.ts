import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
  "frame-src": "blob:",
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

/** Returns a list of problems; empty means the file matches the spec. */
export function checkHeaders(rules: ParsedHeaders): string[] {
  const problems: string[] = [];
  const all = rules["/*"];
  if (!all) return ["Missing the /* rule."];

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
    const got = rules[path]?.["cache-control"];
    if (got === undefined) problems.push(`Missing Cache-Control rule for ${path}.`);
    else if (got !== expected) problems.push(`Cache-Control for ${path} is "${got}", expected "${expected}".`);
  }
  return problems;
}

function main(): void {
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const targets = process.argv.slice(2);
  const files = targets.length > 0 ? targets : [join(repo, "public", "_headers"), join(repo, "dist", "_headers")];
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
    const problems = checkHeaders(parseHeaders(readFileSync(file, "utf8")));
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
