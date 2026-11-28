import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBase } from "./base.ts";
import { type HeaderConfig, readConfig, TARGETS } from "./render.ts";

/**
 * `pnpm deploy:build` writes every host configuration from deploy/headers.json; `pnpm deploy:check` fails when a
 * committed file differs. For a subpath build, `--base /coffer/ --out <dir>` writes the variants there instead.
 */
export function drift(root: string, config: HeaderConfig): string[] {
  return Object.entries(TARGETS).flatMap(([path, render]) => {
    const file = join(root, path);
    return existsSync(file) && readFileSync(file, "utf8") === render(config) ? [] : [path];
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const config = readConfig();
  if (args.includes("--check")) {
    const stale = drift(repo, config);
    for (const path of stale) console.error(`${path} differs from deploy/headers.json: run pnpm deploy:build.`);
    if (stale.length === 0) console.log("Host configurations match deploy/headers.json.");
    process.exit(stale.length === 0 ? 0 : 1);
  }
  const base = normalizeBase(option("--base"));
  const out = option("--out");
  if (base !== "/" && out === undefined) {
    console.error("A subpath variant is not committed: give --out <dir> with --base.");
    process.exit(1);
  }
  for (const [path, render] of Object.entries(TARGETS)) {
    const file = join(out ?? repo, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, render(config, base));
    console.log(`Wrote ${relative(process.cwd(), file)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
