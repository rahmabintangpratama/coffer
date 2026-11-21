// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDist } from "./check";

function dist(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "coffer-dist-"));
  for (const file of files) {
    const path = join(root, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "x");
  }
  return root;
}
const GOOD = ["index.html", "_headers", "theme-init.js", "manifest.webmanifest", "favicon.svg", "assets/index-abcd1234.js", "assets/index-abcd1234.css", "assets/pdf.worker.min-Ab_c-d12.mjs", "fonts/ibm-plex-sans-latin-400-normal.woff2", "fonts/OFL.txt", "icons/favicon.ico", "icons/apple-touch-icon.png"];

describe("dist allowlist (C-22)", () => {
  it("accepts the allowlist, index.html and hashed assets", () => {
    expect(checkDist(dist(GOOD))).toEqual([]);
  });
  it("rejects the agent docs that public/ carries", () => {
    const problems = checkDist(dist([...GOOD, "AGENTS.md", "CLAUDE.md"]));
    expect(problems.join("\n")).toMatch(/Unexpected top-level entry: AGENTS\.md/);
    expect(problems.join("\n")).toMatch(/Unexpected top-level entry: CLAUDE\.md/);
  });
  it("rejects source maps, unhashed assets, stray fonts and icons", () => {
    const problems = checkDist(dist([...GOOD, "assets/index-abcd1234.js.map", "assets/plain.js", "fonts/notes.md", "icons/readme.txt"])).join("\n");
    expect(problems).toMatch(/Source map/);
    expect(problems).toMatch(/Unhashed file in assets\/: assets\/plain\.js/);
    expect(problems).toMatch(/Unexpected file in fonts\//);
    expect(problems).toMatch(/Unexpected file in icons\//);
  });
  it("reports a missing index.html", () => {
    expect(checkDist(dist(GOOD.filter((file) => file !== "index.html"))).join("\n")).toMatch(/index\.html is missing/);
  });
});
