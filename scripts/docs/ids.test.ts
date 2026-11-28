// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Open questions, decisions and design conflicts are cited by ID from code and docs, so each ID is defined once.
// A definition is a heading ("### OQ-1: ...") or the first cell of a table row ("| D-1 | ...").
const docs = fileURLToPath(new URL("../../docs", import.meta.url));
const DEFINITION = /^(?:#{2,6} |\| )((?:OQ|DC|D|C)-\d+)(?=\b)(?::| \|)/gm;

export function definitionsIn(markdown: string): string[] {
  return [...markdown.matchAll(DEFINITION)].map((match) => match[1] ?? "");
}

/** Every ID defined more than once, with the files that define it. */
export function duplicates(files: readonly (readonly [name: string, markdown: string])[]): Record<string, string[]> {
  const places = new Map<string, string[]>();
  for (const [name, markdown] of files) for (const id of definitionsIn(markdown)) places.set(id, [...(places.get(id) ?? []), name]);
  return Object.fromEntries([...places].filter(([, names]) => names.length > 1));
}

const markdownFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? markdownFiles(join(dir, entry.name)) : entry.name.endsWith(".md") ? [join(dir, entry.name)] : []));

describe("OQ, D, C and DC IDs in docs/", () => {
  const files = markdownFiles(docs).map((path) => [relative(docs, path), readFileSync(path, "utf8")] as const);

  it("are each defined once", () => {
    expect(duplicates(files)).toEqual({});
  });

  it("are found: the log defines all four kinds", () => {
    const kinds = new Set(files.flatMap(([, markdown]) => definitionsIn(markdown)).map((id) => id.split("-")[0]));
    expect([...kinds].sort()).toEqual(["C", "D", "DC", "OQ"]);
  });

  it("a second definition is reported, a reference is not", () => {
    const log = "### OQ-1: A\n| D-2 | x | cites C-3 |\n";
    expect(duplicates([["a.md", log], ["b.md", "### OQ-1: B\nSee D-2.\n| D-20 | y |\n"]])).toEqual({ "OQ-1": ["a.md", "b.md"] });
  });
});
