import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The bundle budgets from docs/technical-spec.md section 14, checked on the built dist/.
const KIB = 1024;
export const BUDGETS = {
  /** The entry (the scripts index.html loads or preloads), gzip. The first-screen total is measured in tests/e2e/first-load.spec.ts (D-43). */
  initialJs: 90 * KIB,
  /** The S3 chunk (client-s3, presigner, orchestrator), gzip. */
  s3Chunk: 200 * KIB,
  /** The pdf.js worker file, gzip. */
  pdfWorker: 400 * KIB,
} as const;

/** Text that only the lazy libraries contain: if it shows up in the initial bundle, a lazy chunk leaked into it. */
export const LAZY_MARKERS: Record<string, string> = {
  "pdf.js": "GlobalWorkerOptions",
  "markdown-it": "markdown-it",
  DOMPurify: "DOMPurify",
};

export interface FileSize {
  file: string;
  raw: number;
  gzip: number;
}
export interface Report {
  initial: FileSize[];
  lazy: FileSize[];
  problems: string[];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sizeOf = (root: string, path: string): FileSize => {
  const bytes = readFileSync(path);
  return { file: relative(root, path), raw: bytes.length, gzip: gzipSync(bytes).length };
};

/** Read dist/, split its scripts into initial and lazy, and compare them with the budgets. */
export function analyze(dist: string): Report {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const initialPaths = new Set<string>();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.(?:m?js))"/g)) {
    const url = match[1];
    if (url?.startsWith("/")) initialPaths.add(join(dist, url));
  }
  const all = walk(dist).filter((path) => /\.m?js$/.test(path));
  const initial = [...initialPaths].filter((path) => existsSync(path)).map((path) => sizeOf(dist, path));
  const lazy = all.filter((path) => !initialPaths.has(path)).map((path) => sizeOf(dist, path)).sort((a, b) => b.gzip - a.gzip);

  const problems: string[] = [];
  const initialGzip = initial.reduce((sum, entry) => sum + entry.gzip, 0);
  if (initialGzip > BUDGETS.initialJs) problems.push(`Initial JavaScript is ${(initialGzip / KIB).toFixed(1)} KiB gzip; the budget is ${(BUDGETS.initialJs / KIB).toString()} KiB.`);
  for (const [name, marker] of Object.entries(LAZY_MARKERS)) {
    const leaked = initial.find((entry) => readFileSync(join(dist, entry.file), "utf8").includes(marker));
    if (leaked) problems.push(`${name} is in the initial bundle (${leaked.file}); it must load on first use.`);
    if (!lazy.some((entry) => readFileSync(join(dist, entry.file), "utf8").includes(marker))) problems.push(`${name} was not found in any lazy chunk.`);
  }
  const worker = lazy.find((entry) => entry.file.includes("pdf.worker"));
  if (!worker) problems.push("The pdf.js worker file is not in dist/.");
  else if (worker.gzip > BUDGETS.pdfWorker) problems.push(`The pdf.js worker is ${(worker.gzip / KIB).toFixed(1)} KiB gzip; the budget is ${(BUDGETS.pdfWorker / KIB).toString()} KiB.`);
  const s3 = lazy.find((entry) => /(^|\/)s3-[^/]*\.js$/.test(entry.file));
  if (s3 && s3.gzip > BUDGETS.s3Chunk) problems.push(`The S3 chunk is ${(s3.gzip / KIB).toFixed(1)} KiB gzip; the budget is ${(BUDGETS.s3Chunk / KIB).toString()} KiB.`);
  return { initial, lazy, problems };
}

const kib = (bytes: number) => `${(bytes / KIB).toFixed(1).padStart(8)} KiB`;

export function printReport(report: Report): void {
  const initialGzip = report.initial.reduce((sum, entry) => sum + entry.gzip, 0);
  console.log(`Initial JavaScript: ${kib(initialGzip)} gzip of ${(BUDGETS.initialJs / KIB).toString()} KiB (${report.initial.length.toString()} files)`);
  console.log("Lazy chunks, largest first (gzip):");
  for (const entry of report.lazy.slice(0, 12)) console.log(`  ${kib(entry.gzip)}  ${entry.file}`);
  for (const problem of report.problems) console.error(`PROBLEM: ${problem}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
  if (!existsSync(join(dist, "index.html"))) {
    console.error("dist/ is missing: run pnpm build first.");
    process.exit(1);
  }
  const report = analyze(dist);
  printReport(report);
  process.exit(report.problems.length === 0 ? 0 : 1);
}
