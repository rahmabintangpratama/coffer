/**
 * The performance budgets of technical-spec 14 that a lab run can check, as data, and the check itself. JavaScript bytes are not
 * here: Lighthouse's transfer size counts the response headers of every request (the CSP alone is about 700 bytes, sent with
 * each script) and everything the page fetches while idle, so it overstates what the 120 KiB budget means. tests/e2e/first-load.spec.ts
 * measures the gzip body of the scripts the first screen needs, for Welcome and for Unlock. The run
 * (`pnpm lighthouse`) serves the production build with its real `_headers` and gzip like the host, on a mobile profile
 * (4x CPU slowdown, simulated 9 Mbps with 150 ms round trip), and fails when a page is over its budget.
 */
const KIB = 1024;

export const THROTTLING = { rttMs: 150, throughputKbps: 9000, cpuSlowdownMultiplier: 4, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 } as const;

export interface NavigationBudget {
  /** Time to interactive, ms (technical-spec 14: 3.5 s for Welcome). */
  interactiveMs: number;
  lcpMs: number;
  cls: number;
  /** Total blocking time stands in for INP, which a page load cannot measure (INP is checked on the Files interaction run). */
  tbtMs: number;
  stylesheetBytes: number;
  fontBytes: number;
}

export const NAVIGATION: NavigationBudget = {
  interactiveMs: 3500,
  lcpMs: 2500,
  cls: 0.1,
  tbtMs: 200,
  stylesheetBytes: 25 * KIB,
  fontBytes: 100 * KIB,
};

export interface InteractionBudget {
  cls: number;
  /** INP when the run measured one, else total blocking time. */
  inpMs: number;
}

export const INTERACTION: InteractionBudget = { cls: 0.1, inpMs: 200 };

/** The few fields of a Lighthouse result the check reads. */
export interface LhrLike {
  audits: Record<string, { numericValue?: number | undefined; details?: { items?: { resourceType?: string; transferSize?: number }[] } | undefined } | undefined>;
}

const value = (lhr: LhrLike, id: string): number | undefined => lhr.audits[id]?.numericValue;
const transfer = (lhr: LhrLike, type: string): number => lhr.audits["resource-summary"]?.details?.items?.find((item) => item.resourceType === type)?.transferSize ?? 0;

const over = (name: string, got: number | undefined, limit: number, unit: string): string | null =>
  got === undefined ? `${name}: Lighthouse did not report it.` : got > limit ? `${name} is ${Math.round(got * 100) / 100}${unit}, over the budget of ${limit}${unit}.` : null;

/** Problems with a page-load run against its budget; empty means it is inside. */
export function checkNavigation(lhr: LhrLike, budget: NavigationBudget = NAVIGATION): string[] {
  return [
    over("Time to interactive", value(lhr, "interactive"), budget.interactiveMs, " ms"),
    over("Largest contentful paint", value(lhr, "largest-contentful-paint"), budget.lcpMs, " ms"),
    over("Cumulative layout shift", value(lhr, "cumulative-layout-shift"), budget.cls, ""),
    over("Total blocking time", value(lhr, "total-blocking-time"), budget.tbtMs, " ms"),
    over("CSS transferred", transfer(lhr, "stylesheet"), budget.stylesheetBytes, " bytes"),
    over("Fonts transferred", transfer(lhr, "font"), budget.fontBytes, " bytes"),
  ].filter((problem): problem is string => problem !== null);
}

/** Problems with a timespan run (opening a folder and scrolling it) against its budget. */
export function checkInteraction(lhr: LhrLike, budget: InteractionBudget = INTERACTION): string[] {
  const inp = value(lhr, "interaction-to-next-paint") ?? value(lhr, "total-blocking-time");
  return [over("Cumulative layout shift", value(lhr, "cumulative-layout-shift"), budget.cls, ""), over("Interaction to next paint (or total blocking time)", inp, budget.inpMs, " ms")].filter(
    (problem): problem is string => problem !== null,
  );
}
