import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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

export function startServer(dir: string, port: number): Promise<Server> {
  const root = resolve(dir);
  const rules = parseHeaders(readFileSync(join(root, "_headers"), "utf8"));

  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
      const file = resolve(root, relative);
      const headers = headersFor(rules, pathname);
      try {
        if (file !== root && !file.startsWith(root + sep)) throw new Error("outside root");
        const body = await readFile(file);
        response.writeHead(200, { ...headers, "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        response.end(body);
      } catch {
        response.writeHead(404, { ...headers, "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
    })();
  });

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
  void startServer(dir, port).then(() => {
    console.log(`Serving ${dir} with its _headers on http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
