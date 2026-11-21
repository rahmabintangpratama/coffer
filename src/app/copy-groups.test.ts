// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORE_GROUPS } from "@/lib/i18n/groups";

// Copy loads by top-level group, and only the core groups are in the first bundle. A feature that calls t() with a key
// from a group the route did not load crashes in the browser, while unit tests (which load every group) stay green.
// This test finds that class of bug without a browser: every group the browse, preview, upload and operation code uses
// must be core or in the list ConnectedApp loads before it renders those screens.
const src = fileURLToPath(new URL("../", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

const groupsUsedIn = (dirs: string[]): Map<string, string> => {
  const used = new Map<string, string>();
  for (const dir of dirs) {
    for (const file of files(join(src, dir))) {
      for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([a-zA-Z]+)\.[^"]+"/g)) {
        if (match[1] && !used.has(match[1])) used.set(match[1], file.replace(src, "src/"));
      }
    }
  }
  return used;
};

const listIn = (file: string, name: string): string[] => {
  const text = readFileSync(join(src, file), "utf8");
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\] as const`).exec(text);
  return Array.from((match?.[1] ?? "").matchAll(/"([a-zA-Z]+)"/g), (item) => item[1] ?? "");
};

describe("copy groups loaded before the screens that use them", () => {
  const loaded = new Set<string>([...CORE_GROUPS, ...listIn("app/ConnectedApp.tsx", "filesGroups")]);

  it("every group used by browse, preview, upload and operations is core or loaded by ConnectedApp", () => {
    const used = groupsUsedIn(["features/files", "features/operations", "features/preview", "features/transfers"]);
    const missing = [...used].filter(([group]) => !loaded.has(group)).map(([group, where]) => `${group} (first used in ${where})`);
    expect(missing).toEqual([]);
  });

  it("finds the list it checks against, so the test cannot pass by reading nothing", () => {
    expect(listIn("app/ConnectedApp.tsx", "filesGroups").length).toBeGreaterThan(10);
    expect(groupsUsedIn(["features/files"]).size).toBeGreaterThan(5);
  });

  it("the transfer panel host loads what the panel uses", () => {
    const hostGroups = new Set(Array.from(readFileSync(join(src, "app/TransferPanelHost.tsx"), "utf8").matchAll(/groups=\{\[([^\]]*)\]\}/g)).flatMap((m) => Array.from((m[1] ?? "").matchAll(/"([a-zA-Z]+)"/g), (x) => x[1] ?? "")));
    const panel = groupsUsedIn(["features/transfers"]);
    const needed = [...panel.keys()].filter((group) => !CORE_GROUPS.includes(group as never) && group !== "conf" && group !== "dlg");
    expect(needed.filter((group) => !hostGroups.has(group))).toEqual([]);
  });
});
