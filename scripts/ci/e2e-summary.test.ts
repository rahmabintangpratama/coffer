import { describe, expect, it } from "vitest";
import { summarize, toMarkdown } from "./e2e-summary";

const test = (projectName: string, status: "expected" | "unexpected" | "flaky" | "skipped", attempts = 1) => ({ projectName, status, results: Array.from({ length: attempts }, (_, retry) => ({ duration: 10, retry, status: "passed" })) });
const report = {
  stats: { duration: 61_000 },
  suites: [
    { specs: [{ title: "a", file: "a.spec.ts", line: 3, tests: [test("chromium-375", "expected"), test("webkit-375", "flaky", 2)] }], suites: [
      { specs: [{ title: "b", file: "b.spec.ts", line: 9, tests: [test("webkit-1440", "unexpected", 2), test("webkit-768", "skipped")] }] },
    ] },
  ],
};

describe("e2e summary", () => {
  it("counts passes, flaky, failed and skipped, walking nested suites", () => {
    const summary = summarize(report);
    expect(summary).toMatchObject({ passed: 1, skipped: 1, seconds: 61 });
    expect(summary.flaky).toEqual([{ project: "webkit-375", title: "a", where: "a.spec.ts:3", attempts: 2 }]);
    expect(summary.failed.map((entry) => entry.where)).toEqual(["b.spec.ts:9"]);
  });
  it("names flaky and failed tests in the markdown instead of hiding them", () => {
    const text = toMarkdown(summarize(report));
    expect(text).toContain("1 passed, 1 flaky, 1 failed, 1 skipped");
    expect(text).toContain("### Flaky: failed at first and passed on retry");
    expect(text).toContain("`webkit-375` a.spec.ts:3 a (2 attempts)");
    expect(text).toContain("### Failed");
  });
  it("prints no list when nothing is flaky or failed", () => {
    const text = toMarkdown(summarize({ suites: [{ specs: [{ title: "a", file: "a.spec.ts", line: 1, tests: [test("chromium-375", "expected")] }] }] }));
    expect(text).not.toContain("###");
  });
});
