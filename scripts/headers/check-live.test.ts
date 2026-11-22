// @vitest-environment node
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "../serve/dist-server.ts";
import { checkLive } from "./check.ts";

// `pnpm headers:check --url`: a live deployment is checked by what it sends, here against the repo's own dist server.
const headers = fileURLToPath(new URL("../../public/_headers", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "coffer-live-"));
let base = "";
let close = () => undefined as unknown;

beforeAll(async () => {
  mkdirSync(join(dir, "assets"));
  mkdirSync(join(dir, "fonts"));
  copyFileSync(headers, join(dir, "_headers"));
  writeFileSync(join(dir, "index.html"), '<!doctype html><script type="module" src="/assets/index-abc.js"></script>');
  writeFileSync(join(dir, "assets", "index-abc.js"), "export {};");
  writeFileSync(join(dir, "theme-init.js"), "");
  writeFileSync(join(dir, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(dir, "fonts", "ibm-plex-sans-latin-400-normal.woff2"), "x");
  const server = await startServer(dir, 0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port.toString()}`;
  close = () => server.close();
});
afterAll(() => { close(); });

describe("headers:check --url", () => {
  it("accepts a deployment that sends the headers of _headers on every path", async () => {
    expect(await checkLive(base)).toEqual([]);
  });

  it("names a missing header and the path it is missing on", async () => {
    const real = fetch;
    const dropping: typeof fetch = async (input, init) => {
      const response = await real(input, init);
      const copy = new Headers(response.headers);
      copy.delete("referrer-policy");
      return new Response(await response.arrayBuffer(), { status: response.status, headers: copy });
    };
    const problems = await checkLive(base, dropping);
    expect(problems).toContain("/: missing header referrer-policy.");
    expect(problems.some((problem) => problem.startsWith("/assets/index-abc.js: missing header referrer-policy"))).toBe(true);
  });

  it("rejects a CSP that was loosened or a cache rule that was changed", async () => {
    const real = fetch;
    const rewriting: typeof fetch = async (input, init) => {
      const response = await real(input, init);
      const copy = new Headers(response.headers);
      copy.set("content-security-policy", (copy.get("content-security-policy") ?? "").replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"));
      copy.set("cache-control", "public, max-age=60");
      return new Response(await response.arrayBuffer(), { status: response.status, headers: copy });
    };
    const text = (await checkLive(base, rewriting)).join("\n");
    expect(text).toContain("script-src");
    expect(text).toContain("'unsafe-inline'");
    expect(text).toContain('Cache-Control is "public, max-age=60"');
  });

  it("reports an unreachable address and a path that is not 200", async () => {
    expect((await checkLive("http://127.0.0.1:1")).join("\n")).toContain("Could not reach");
    const notFound: typeof fetch = (input) => {
      const root = new URL(input instanceof Request ? input.url : input.toString()).pathname === "/";
      return Promise.resolve(new Response(root ? "<html></html>" : "no", { status: root ? 200 : 404 }));
    };
    expect((await checkLive(base, notFound)).join("\n")).toContain("status 404, expected 200");
  });
});
