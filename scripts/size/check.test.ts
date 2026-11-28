// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyze, BUDGETS } from "./check";

function dist(files: Record<string, string>, html: string): string {
  const root = mkdtempSync(join(tmpdir(), "coffer-size-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), html);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, "assets", name), content);
  return root;
}
const HTML = '<script type="module" src="/assets/index-a.js"></script><link rel="modulepreload" href="/assets/vendor-b.js">';
const lazy = { "pdf-c.js": "GlobalWorkerOptions", "pdf.worker.min-d.mjs": "worker", "md-e.js": "markdown-it", "purify-f.js": "DOMPurify" };

describe("bundle budgets (technical-spec 14)", () => {
  it("passes when the lazy libraries are outside the initial bundle and the sizes are in budget", () => {
    const report = analyze(dist({ "index-a.js": "entry", "vendor-b.js": "vendor", ...lazy }, HTML));
    expect(report.problems).toEqual([]);
    expect(report.initial.map((entry) => entry.file).sort()).toEqual(["assets/index-a.js", "assets/vendor-b.js"]);
    expect(report.lazy.map((entry) => entry.file)).toContain("assets/pdf.worker.min-d.mjs");
  });

  it("ADR-010 measures a subpath build, and fails when it finds no initial script", () => {
    const built = dist({ "index-a.js": "entry", "vendor-b.js": "vendor", ...lazy }, HTML.replaceAll("/assets/", "/coffer/assets/"));
    expect(analyze(built, "/coffer/").initial).toHaveLength(2);
    expect(analyze(built).problems.join("\n")).toContain("names no script under /");
  });

  it("fails when pdf.js leaks into the initial bundle", () => {
    const report = analyze(dist({ "index-a.js": "entry GlobalWorkerOptions", "vendor-b.js": "v", ...lazy }, HTML));
    expect(report.problems.join("\n")).toMatch(/pdf\.js is in the initial bundle/);
  });

  it("fails when a lazy library is missing from dist, so the check cannot pass by accident", () => {
    const rest: Record<string, string> = { ...lazy };
    delete rest["md-e.js"];
    const report = analyze(dist({ "index-a.js": "entry", "vendor-b.js": "v", ...rest }, HTML));
    expect(report.problems.join("\n")).toMatch(/markdown-it was not found in any lazy chunk/);
  });

  it("fails when the initial JavaScript is over budget", () => {
    // Random bytes do not compress, so the gzip size is close to the raw size.
    const noise = Buffer.from(Array.from({ length: BUDGETS.initialJs + 4096 }, () => Math.floor(Math.random() * 256))).toString("latin1");
    const report = analyze(dist({ "index-a.js": noise, "vendor-b.js": "v", ...lazy }, HTML));
    expect(report.problems.join("\n")).toMatch(/Initial JavaScript is/);
  });

  it("fails when the pdf.js worker is over its budget", () => {
    const noise = Buffer.from(Array.from({ length: BUDGETS.pdfWorker + 4096 }, () => Math.floor(Math.random() * 256))).toString("latin1");
    const report = analyze(dist({ "index-a.js": "entry", "vendor-b.js": "v", ...lazy, "pdf.worker.min-d.mjs": noise }, HTML));
    expect(report.problems.join("\n")).toMatch(/pdf\.js worker is/);
  });
});
