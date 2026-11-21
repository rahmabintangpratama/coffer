import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface JsonResult { duration: number; retry: number; status: string }
interface JsonTest { projectName: string; status: "expected" | "unexpected" | "flaky" | "skipped"; results: JsonResult[] }
interface JsonSpec { title: string; file: string; line: number; tests: JsonTest[] }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[] }
interface JsonReport { suites: JsonSuite[]; stats?: { duration?: number } }

export interface Entry { project: string; title: string; where: string; attempts: number }
export interface Summary { passed: number; flaky: Entry[]; failed: Entry[]; skipped: number; seconds: number }

function walk(suite: JsonSuite, visit: (spec: JsonSpec) => void): void {
  for (const spec of suite.specs ?? []) visit(spec);
  for (const child of suite.suites ?? []) walk(child, visit);
}

/** Count what the merged Playwright JSON report says, keeping flaky tests apart from passes: a retry that passed is not a pass. */
export function summarize(report: JsonReport): Summary {
  const summary: Summary = { passed: 0, flaky: [], failed: [], skipped: 0, seconds: Math.round((report.stats?.duration ?? 0) / 1000) };
  for (const suite of report.suites) {
    walk(suite, (spec) => {
      for (const test of spec.tests) {
        const entry: Entry = { project: test.projectName, title: spec.title, where: `${spec.file}:${spec.line.toString()}`, attempts: test.results.length };
        if (test.status === "expected") summary.passed += 1;
        else if (test.status === "skipped") summary.skipped += 1;
        else if (test.status === "flaky") summary.flaky.push(entry);
        else summary.failed.push(entry);
      }
    });
  }
  return summary;
}

export function toMarkdown(summary: Summary): string {
  const lines = [
    "## End-to-end tests",
    "",
    `${summary.passed.toString()} passed, ${summary.flaky.length.toString()} flaky, ${summary.failed.length.toString()} failed, ${summary.skipped.toString()} skipped, ${summary.seconds.toString()} s of test time summed over the matrix jobs.`,
  ];
  const list = (title: string, entries: Entry[]) => {
    if (entries.length === 0) return;
    lines.push("", `### ${title}`, "");
    for (const entry of entries) lines.push(`- \`${entry.project}\` ${entry.where} ${entry.title} (${entry.attempts.toString()} attempts)`);
  };
  list("Failed", summary.failed);
  list("Flaky: failed at first and passed on retry", summary.flaky);
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/ci/e2e-summary.ts <report.json>");
    process.exit(2);
  }
  process.stdout.write(toMarkdown(summarize(JSON.parse(readFileSync(file, "utf8")) as JsonReport)));
}
