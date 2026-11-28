import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBase } from "../deploy/base.ts";

/**
 * dist/ ships what C-22 allows from public/ (`_headers`, `fonts/`, `theme-init.js`,
 * `manifest.webmanifest`, `icons/`, `favicon.svg`), `index.html`, and the hashed build
 * output in `assets/`. Nothing else: no agent docs, no source maps, no stray files.
 */
const TOP_LEVEL = new Set(["_headers", "assets", "favicon.svg", "fonts", "icons", "index.html", "manifest.webmanifest", "theme-init.js"]);
const HASHED = /-[A-Za-z0-9_-]{8}\.(?:js|mjs|css|woff2?|png|svg|json|wasm)$/;
const FONT = /^(?:ibm-plex-[a-z0-9-]+\.woff2|OFL\.txt)$/;
const ICON = /\.(?:png|svg|ico)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Addresses from the root of the origin in a page or a style sheet: `src="/x"`, `href="/x"`, `url(/x)`. */
const ROOT_ADDRESS = /(?:\b(?:src|href)=["']|url\(["']?)(\/(?!\/)[^"')\s]*)/g;

/** Under a subpath, an address that does not start with the base asks the host for a file that is not there. */
export function outsideBase(text: string, base: string): string[] {
  return [...text.matchAll(ROOT_ADDRESS)].map((match) => match[1] ?? "").filter((address) => !address.startsWith(base));
}

/** Returns a list of problems; empty means dist/ holds only what it should. */
export function checkDist(dist: string, base = "/"): string[] {
  const problems: string[] = [];
  const pages = existsSync(dist) ? files(dist).filter((path) => /\.(?:html|css|webmanifest)$/.test(path)) : [];
  for (const path of pages) for (const address of outsideBase(readFileSync(path, "utf8"), base)) problems.push(`${relative(dist, path)} asks for ${address}, outside the base ${base}`);
  if (!existsSync(join(dist, "index.html"))) problems.push("index.html is missing.");
  for (const name of readdirSync(dist)) {
    if (!TOP_LEVEL.has(name)) problems.push(`Unexpected top-level entry: ${name}`);
  }
  for (const path of files(dist)) {
    const rel = relative(dist, path);
    const [top = "", ...rest] = rel.split("/");
    const name = rest.at(-1) ?? top;
    if (name.endsWith(".map")) problems.push(`Source map in dist: ${rel}`);
    if (/\.md$/i.test(name)) problems.push(`Markdown in dist: ${rel}`);
    if (top === "assets" && !HASHED.test(name)) problems.push(`Unhashed file in assets/: ${rel}`);
    if (top === "assets" && rest.length > 1) problems.push(`Nested file in assets/: ${rel}`);
    if (top === "fonts" && !FONT.test(name)) problems.push(`Unexpected file in fonts/: ${rel}`);
    if (top === "icons" && !ICON.test(name)) problems.push(`Unexpected file in icons/: ${rel}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
  if (!existsSync(dist)) {
    console.error("dist/ is missing: run pnpm build first.");
    process.exit(1);
  }
  const problems = checkDist(dist, normalizeBase(process.env.COFFER_BASE));
  for (const problem of problems) console.error(`PROBLEM: ${problem}`);
  if (problems.length === 0) console.log(`dist/ holds only the C-22 allowlist, index.html and hashed assets (${files(dist).length.toString()} files).`);
  process.exit(problems.length === 0 ? 0 : 1);
}
