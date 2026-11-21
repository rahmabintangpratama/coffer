import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface Part { renderedLength: number; gzipLength: number; metaUid: string }
interface Meta { id: string; moduleParts: Record<string, string> }
interface Stats { nodeParts: Record<string, Part>; nodeMetas: Record<string, Meta> }
export interface Row { group: string; gzip: number; rendered: number }

/** A module path to the name people use for it: a package, or a folder of src/. */
export function groupOf(id: string): string {
  const clean = id.replaceAll("\\", "/").replace(/\?.*$/, "");
  const pnpm = /node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(clean);
  const plain = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(clean);
  const pkg = pnpm?.[1] ?? plain?.[1];
  if (pkg) return pkg;
  const src = /\/src\/([^/]+)(?:\/([^/]+))?/.exec(clean);
  if (src) return src[2] && !/\.[a-z]+$/.test(src[2]) ? `src/${src[1] ?? ""}/${src[2]}` : `src/${src[1] ?? ""}`;
  return clean.split("/").slice(-2).join("/");
}

/**
 * Per-module sizes of the chunks index.html loads on first paint, summed by package or
 * src folder. The per-module gzip sizes add up to more than the chunk's own gzip (each
 * module is compressed alone), so read them as proportions.
 */
export function initialBreakdown(stats: Stats, initialChunks: ReadonlySet<string>): Row[] {
  const rows = new Map<string, Row>();
  for (const meta of Object.values(stats.nodeMetas)) {
    for (const [chunk, partUid] of Object.entries(meta.moduleParts)) {
      if (!initialChunks.has(chunk)) continue;
      const part = stats.nodeParts[partUid];
      if (!part) continue;
      const group = groupOf(meta.id);
      const row = rows.get(group) ?? { group, gzip: 0, rendered: 0 };
      row.gzip += part.gzipLength;
      row.rendered += part.renderedLength;
      rows.set(group, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.gzip - a.gzip);
}

export function initialChunkNames(html: string): Set<string> {
  const names = new Set<string>();
  for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.m?js)"/g)) if (match[1]) names.add(match[1]);
  return names;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  if (!existsSync(join(root, "bundle-stats.json"))) {
    console.error("bundle-stats.json is missing: run pnpm size:analyze.");
    process.exit(1);
  }
  const stats = JSON.parse(readFileSync(join(root, "bundle-stats.json"), "utf8")) as Stats;
  const chunks = initialChunkNames(readFileSync(join(root, "dist/index.html"), "utf8"));
  const rows = initialBreakdown(stats, chunks);
  const total = rows.reduce((sum, row) => sum + row.gzip, 0);
  console.log(`Initial chunks (${chunks.size.toString()}), module gzip summed by group: ${(total / 1024).toFixed(1)} KiB (proportions; see pnpm size:check for the real gzip)`);
  for (const row of rows.slice(0, Number(process.argv[2] ?? 25))) {
    console.log(`${(row.gzip / 1024).toFixed(1).padStart(7)} KiB  ${((row.gzip / total) * 100).toFixed(0).padStart(3)}%  ${row.group}`);
  }
}
