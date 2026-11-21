import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { CORE_GROUPS } from "../../src/lib/i18n/groups.ts";

type Tree = Record<string, unknown>;

const PREFIX = "virtual:copy/";
const RESOLVED = "\0" + PREFIX;
const isTree = (value: unknown): value is Tree => typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep merge; a string in the override wins (the additions file overrides the design copy). */
export function mergeTrees(base: Tree, override: Tree): Tree {
  const result: Tree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isTree(current) && isTree(value) ? mergeTrees(current, value) : value;
  }
  return result;
}

const core: readonly string[] = CORE_GROUPS;

/** Split a merged copy tree into the core groups and one entry per other group. */
export function splitGroups(merged: Tree): { core: Tree; lazy: Record<string, Tree> } {
  const coreTree: Tree = {};
  const lazy: Record<string, Tree> = {};
  for (const [name, value] of Object.entries(merged)) {
    if (!isTree(value)) throw new Error(`Copy: top-level key "${name}" must be a group, not a string.`);
    if (core.includes(name)) coreTree[name] = value;
    else lazy[name] = value;
  }
  for (const name of core) {
    if (!(name in coreTree)) throw new Error(`Copy: core group "${name}" does not exist.`);
  }
  return { core: coreTree, lazy };
}

/**
 * Serves the copy as virtual modules so each feature group becomes its own chunk:
 * `virtual:copy/core` (in the first bundle), `virtual:copy/<group>` (one per other
 * group) and `virtual:copy/loaders` (a map of dynamic imports).
 */
export function copyGroups(root: string = process.cwd()): Plugin {
  const designPath = join(root, "design", "copy.en.json");
  const additionsPath = join(root, "src", "lib", "i18n", "copy.additions.en.json");
  const read = () =>
    splitGroups(
      mergeTrees(
        JSON.parse(readFileSync(designPath, "utf8")) as Tree,
        JSON.parse(readFileSync(additionsPath, "utf8")) as Tree,
      ),
    );

  return {
    name: "coffer-copy-groups",
    resolveId(source) {
      return source.startsWith(PREFIX) ? `\0${source}` : null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return null;
      this.addWatchFile(designPath);
      this.addWatchFile(additionsPath);
      const name = id.slice(RESOLVED.length);
      const groups = read();
      if (name === "core") return `export default ${JSON.stringify(groups.core)};`;
      if (name === "loaders") {
        const entries = Object.keys(groups.lazy).map(
          (group) => `  ${JSON.stringify(group)}: () => import(${JSON.stringify(`${PREFIX}${group}`)}),`,
        );
        return `export default {\n${entries.join("\n")}\n};`;
      }
      const tree = groups.lazy[name];
      if (!tree) throw new Error(`Copy: unknown or core group "${name}" requested as ${id}.`);
      return `export default ${JSON.stringify(tree)};`;
    },
  };
}
