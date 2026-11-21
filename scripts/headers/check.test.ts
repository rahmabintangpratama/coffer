// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkHeaders, parseHeaders } from "./check.ts";

const headersFile = readFileSync(fileURLToPath(new URL("../../public/_headers", import.meta.url)), "utf8");

describe("_headers check", () => {
  it("accepts public/_headers", () => {
    expect(checkHeaders(parseHeaders(headersFile))).toEqual([]);
  });

  it("parses paths and header names", () => {
    const rules = parseHeaders("/a\n  X-One: 1\n/b\n  X-Two: two: parts\n");
    expect(rules).toEqual({ "/a": { "x-one": "1" }, "/b": { "x-two": "two: parts" } });
  });

  it("rejects unsafe-inline in the CSP", () => {
    const changed = headersFile.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    expect(checkHeaders(parseHeaders(changed)).join("\n")).toContain("'unsafe-inline'");
  });

  it("rejects a third-party script origin", () => {
    const changed = headersFile.replace("script-src 'self'", "script-src 'self' https://cdn.example.com");
    expect(checkHeaders(parseHeaders(changed)).join("\n")).toContain("script-src");
  });

  it("rejects a missing directive and an unexpected one", () => {
    const missing = headersFile.replace(" frame-ancestors 'none'", "");
    expect(checkHeaders(parseHeaders(missing)).join("\n")).toContain("missing the frame-ancestors");
    const extra = headersFile.replace("object-src 'none';", "object-src 'none'; upgrade-insecure-requests;");
    expect(checkHeaders(parseHeaders(extra)).join("\n")).toContain("upgrade-insecure-requests");
  });

  it("rejects HSTS preload and a missing cache rule", () => {
    const preload = headersFile.replace("includeSubDomains", "includeSubDomains; preload");
    expect(checkHeaders(parseHeaders(preload)).join("\n")).toContain("strict-transport-security");
    const noCache = headersFile.replace("/index.html\n  Cache-Control: no-cache\n", "");
    expect(checkHeaders(parseHeaders(noCache)).join("\n")).toContain("/index.html");
  });

  it("requires a long cache for icons", () => {
    const noIcons = headersFile.replace("/icons/*\n  Cache-Control: public, max-age=31536000, immutable\n", "");
    expect(checkHeaders(parseHeaders(noIcons)).join("\n")).toContain("/icons/*");
  });
});
