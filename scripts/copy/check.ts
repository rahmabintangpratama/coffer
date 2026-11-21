import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

interface CopyTree { [key: string]: string | CopyTree }

/**
 * Design keys that the additions file is allowed to override. Each entry must
 * also be recorded in docs/open-questions.md (C-15, D-21).
 */
export const ALLOWED_OVERRIDES: readonly string[] = ["files.emptyBucket.body"];

export function flatten(tree: CopyTree, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") flat.set(path, value);
    else for (const [k, v] of flatten(value, path)) flat.set(k, v);
  }
  return flat;
}

export interface MergeResult {
  keys: Map<string, string>;
  problems: string[];
}

/** Merge the additions over the design copy and report structural problems. */
export function mergeCopy(design: CopyTree, additions: CopyTree): MergeResult {
  const keys = flatten(design);
  const problems: string[] = [];
  const designPaths = [...keys.keys()];
  for (const [key, value] of flatten(additions)) {
    const parents = key.split(".").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("."));
    for (const parent of parents) {
      if (keys.has(parent)) problems.push(`Addition ${key} needs ${parent} to be a group, but it is a string.`);
    }
    if (designPaths.some((path) => path.startsWith(`${key}.`))) {
      problems.push(`Addition ${key} is a string, but the design copy has a group at that path.`);
    }
    if (designPaths.includes(key) && !ALLOWED_OVERRIDES.includes(key)) {
      problems.push(`Addition ${key} overrides a design key. Record it in docs/open-questions.md and ALLOWED_OVERRIDES.`);
    }
    keys.set(key, value);
  }
  return { keys, problems };
}

export interface KeyUse {
  file: string;
  line: number;
  key: string;
}

// Copy keys are referenced only as string literals passed to t("a.b.c").
const T_CALL = /\bt\(\s*(["'`])([A-Za-z0-9_.-]+)\1/g;

export function findKeyUses(file: string, source: string): KeyUse[] {
  const uses: KeyUse[] = [];
  source.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(T_CALL)) {
      if (match[2] !== undefined) uses.push({ file, line: index + 1, key: match[2] });
    }
  });
  return uses;
}

export function findUnknownKeys(uses: KeyUse[], keys: Map<string, string>): KeyUse[] {
  return uses.filter((use) => !keys.has(use.key));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function main(): void {
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (path: string) => JSON.parse(readFileSync(join(repo, path), "utf8")) as CopyTree;
  const { keys, problems } = mergeCopy(
    read("design/copy.en.json"),
    read("src/lib/i18n/copy.additions.en.json"),
  );
  const uses = sourceFiles(join(repo, "src")).flatMap((file) =>
    findKeyUses(relative(repo, file), readFileSync(file, "utf8")),
  );
  for (const use of findUnknownKeys(uses, keys)) {
    problems.push(`${use.file}:${use.line} uses unknown copy key "${use.key}".`);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log(`Copy OK: ${keys.size} keys, ${uses.length} key references checked.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
