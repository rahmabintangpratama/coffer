// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkHeaders, parseHeaders } from "../headers/check.ts";
import { normalizeBase } from "./base.ts";
import { drift } from "./generate.ts";
import { cspValue, metaTags, readConfig, renderCaddy, renderHeadersFile, renderNginx, renderVercel } from "./render.ts";

// ADR-010: one source for the headers, rendered for each host.
const config = readConfig();
const repo = fileURLToPath(new URL("../../", import.meta.url));
const policy = cspValue(config.csp);

describe("host configurations from deploy/headers.json", () => {
  it("are committed as generated", () => {
    expect(drift(repo, config)).toEqual([]);
  });

  it("a change to the source shows as drift in every file", () => {
    expect(drift(repo, { ...config, headers: { ...config.headers, "Referrer-Policy": "origin" } })).toHaveLength(4);
  });

  it("the source satisfies the security spec (technical-spec 11.2), at the root and under a base", () => {
    expect(checkHeaders(parseHeaders(renderHeadersFile(config)))).toEqual([]);
    expect(checkHeaders(parseHeaders(renderHeadersFile(config, "/coffer/")), "/coffer/")).toEqual([]);
  });

  it("every target carries every header and cache value", () => {
    for (const render of [renderHeadersFile, renderNginx, renderCaddy, renderVercel]) {
      const text = render(config);
      for (const value of [policy, ...Object.values(config.headers), ...config.cache.map((rule) => rule.value)]) expect(text).toContain(value);
    }
  });

  it("a base prefixes every path", () => {
    expect(renderHeadersFile(config, "/coffer/")).toContain("\n/coffer/assets/*\n");
    expect(renderNginx(config, "/coffer/")).toContain('"~^(200|206|304):/coffer/assets/"');
    expect(renderCaddy(config, "/coffer/")).toContain("path /coffer/assets/* /coffer/fonts/*");
    expect(renderVercel(config, "/coffer/")).toContain('"source": "/coffer/assets/(.*)"');
  });

  it("nginx caches only responses that carry a file, and matches whole paths", () => {
    const text = renderNginx(config);
    expect(text).toContain('"~^(200|206|304):/$" "no-cache";');
    expect(text).toContain('"~^(200|206|304):/favicon\\\\.svg$"');
    expect(text).not.toContain("404:");
  });

  it("the meta policy leaves out frame-ancestors and nothing else", () => {
    const [csp = "", referrer = ""] = metaTags(config);
    expect(csp).not.toContain("frame-ancestors");
    expect(csp).toContain("script-src 'self'; ");
    expect(csp.match(/-src/g)).toHaveLength(policy.match(/-src/g)?.length ?? 0);
    expect(referrer).toBe('<meta name="referrer" content="no-referrer" />');
  });
});

describe("COFFER_BASE", () => {
  it("is / by default and always ends with /", () => {
    expect([undefined, "", "/", "/coffer", "/a/b/"].map(normalizeBase)).toEqual(["/", "/", "/", "/coffer/", "/a/b/"]);
  });

  it("refuses anything but a plain absolute path", () => {
    for (const value of ["coffer", "https://example.test/x", "/a/../b", "/a b/", '/a"/', "//"]) expect(() => normalizeBase(value)).toThrow("COFFER_BASE");
  });
});
