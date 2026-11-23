// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkInteraction, checkNavigation, INTERACTION, type LhrLike, NAVIGATION } from "./budgets.ts";

// M10: the budget check itself. A page inside its budget passes; each metric over its limit is named.
const lhr = (over: Record<string, number> = {}, transferred: Record<string, number> = {}): LhrLike => ({
  audits: {
    interactive: { numericValue: over.interactive ?? 2000 },
    "largest-contentful-paint": { numericValue: over.lcp ?? 1800 },
    "cumulative-layout-shift": { numericValue: over.cls ?? 0 },
    "total-blocking-time": { numericValue: over.tbt ?? 50 },
    "interaction-to-next-paint": over.inp === undefined ? undefined : { numericValue: over.inp },
    "resource-summary": { details: { items: [{ resourceType: "script", transferSize: transferred.script ?? 100_000 }, { resourceType: "stylesheet", transferSize: transferred.css ?? 10_000 }, { resourceType: "font", transferSize: transferred.font ?? 60_000 }] } },
  },
});

describe("Lighthouse budgets", () => {
  it("holds the numbers of technical-spec 14", () => {
    expect(NAVIGATION).toMatchObject({ interactiveMs: 3500, lcpMs: 2500, cls: 0.1, stylesheetBytes: 25 * 1024, fontBytes: 100 * 1024 });
    expect(INTERACTION).toEqual({ cls: 0.1, inpMs: 200 });
  });

  it("accepts a page inside every budget", () => {
    expect(checkNavigation(lhr())).toEqual([]);
  });

  it("names each metric that is over", () => {
    const problems = checkNavigation(lhr({ interactive: 4000, lcp: 3000, cls: 0.2, tbt: 400 }, { css: 30_000, font: 120_000 })).join("\n");
    for (const name of ["Time to interactive", "Largest contentful paint", "Cumulative layout shift", "Total blocking time", "CSS transferred", "Fonts transferred"]) expect(problems).toContain(name);
  });

  it("is on the budget exactly at the limit, and over one step past it", () => {
    expect(checkNavigation(lhr({ interactive: 3500 }, { css: 25 * 1024 }))).toEqual([]);
    expect(checkNavigation(lhr({ interactive: 3501 }))).toHaveLength(1);
  });

  it("fails a metric Lighthouse did not report, instead of passing it by silence", () => {
    expect(checkNavigation({ audits: {} }).join("\n")).toContain("did not report");
  });

  it("an interaction run uses INP when there is one, and blocking time otherwise", () => {
    expect(checkInteraction(lhr({ inp: 150 }))).toEqual([]);
    expect(checkInteraction(lhr({ inp: 250 })).join("\n")).toContain("Interaction to next paint");
    expect(checkInteraction(lhr({ tbt: 250 })).join("\n")).toContain("250");
    expect(checkInteraction(lhr({ cls: 0.3 })).join("\n")).toContain("layout shift");
  });
});
