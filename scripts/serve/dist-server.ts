import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBase } from "../deploy/base.ts";
import { parseHeaders, type ParsedHeaders } from "../headers/check.ts";

// Serves a build directory and applies its _headers file the way Cloudflare
// Pages does, so end-to-end tests run under the real CSP. Test tooling only.

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  // The pdf.js worker is a module file; Cloudflare Pages serves .mjs as JavaScript too.
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/vnd.microsoft.icon",
  ".txt": "text/plain; charset=utf-8",
};

/** Header rules whose path matches `pathname`: exact, or a trailing `*` as a prefix. */
export function headersFor(rules: ParsedHeaders, pathname: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rulePath, headers] of Object.entries(rules)) {
    const matches = rulePath.endsWith("*") ? pathname.startsWith(rulePath.slice(0, -1)) : rulePath === pathname;
    if (matches) Object.assign(result, headers);
  }
  return result;
}

/** What Cloudflare Pages compresses on the way out: text. Fonts are already compressed. */
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".txt"]);

/**
 * `gzip` answers like the host does: text is sent gzip-compressed to a browser that accepts it. The Lighthouse run turns it on so
 * its transfer sizes are what a visitor downloads; the e2e run leaves it off.
 */
export function startServer(dir: string, port: number, options: { gzip?: boolean; base?: string } = {}): Promise<Server> {
  const base = options.base ?? "/";
  const root = resolve(dir);
  const rules = parseHeaders(readFileSync(join(root, "_headers"), "utf8"));

  const server = createServer((request, response) => {
    void (async () => {
      let headers: Record<string, string> = {};
      try {
        // A malformed escape such as "/%" throws here; it must answer 404, not crash the server.
        const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
        headers = headersFor(rules, pathname);
        if (!pathname.startsWith(base)) throw new Error("outside the base");
        const below = pathname.slice(base.length - 1);
        const relative = below === "/" ? "index.html" : normalize(below).replace(/^[/\\]+/, "");
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) throw new Error("outside root");
        const body = await readFile(file);
        const type = MIME[extname(file)] ?? "application/octet-stream";
        if (options.gzip === true && COMPRESSIBLE.has(extname(file)) && /\bgzip\b/.test(request.headers["accept-encoding"] ?? "")) {
          response.writeHead(200, { ...headers, "content-type": type, "content-encoding": "gzip", vary: "Accept-Encoding" });
          response.end(gzipSync(body));
          return;
        }
        response.writeHead(200, { ...headers, "content-type": type });
        response.end(body);
      } catch {
        response.writeHead(404, { ...headers, "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
    })();
  });

  // Node closes an idle keep-alive connection after 5 s. A browser that reuses it in that instant sends a request into a closed
  // socket; on webkit CI that showed as a `GET /` with no answer for 30 s (docs/open-questions.md, tracked flaky tests).
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;

  return new Promise((resolveStart) => {
    server.listen(port, "127.0.0.1", () => {
      resolveStart(server);
    });
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    return index === -1 ? fallback : (args[index + 1] ?? fallback);
  };
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dir = option("--dir", join(repo, "dist"));
  const port = Number(option("--port", "4173"));
  const base = normalizeBase(option("--base", process.env.COFFER_BASE ?? "/"));
  void startServer(dir, port, { gzip: args.includes("--gzip"), base }).then(() => {
    console.log(`Serving ${dir} with its _headers on http://127.0.0.1:${port}${base}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
