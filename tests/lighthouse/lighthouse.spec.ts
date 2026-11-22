import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, chromium } from "@playwright/test";
import { startFlow } from "lighthouse";
import puppeteer from "puppeteer-core";
import { checkInteraction, checkNavigation, type LhrLike, THROTTLING, UNLOCK } from "../../scripts/lighthouse/budgets";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "../e2e/fixture";

// M10, technical-spec 14: Welcome, Unlock and Files against their budgets, on a mobile profile, under the real _headers.
// Reports are written to lighthouse-report/ (ignored by git; CI uploads it).
const PASSPHRASE = "lighthouse passphrase not real";
const REPORT_DIR = "lighthouse-report";
const DEBUG_PORT = 9333;

const settings = {
  formFactor: "mobile" as const,
  screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  throttlingMethod: "simulate" as const,
  throttling: THROTTLING,
  onlyCategories: ["performance"],
};

test("AC-NFR performance budgets: Welcome, Unlock and Files stay inside technical-spec 14", async ({ baseURL }) => {
  if (baseURL === undefined) throw new Error("baseURL is required");
  const profile = mkdtempSync(join(tmpdir(), "coffer-lighthouse-"));
  mkdirSync(REPORT_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, { headless: true, args: [`--remote-debugging-port=${DEBUG_PORT}`] });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(baseURL);
    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
    const [lhPage] = await browser.pages();
    if (lhPage === undefined) throw new Error("No tab to measure");

    const flow = await startFlow(lhPage, { name: "Coffer", config: { extends: "lighthouse:default", settings } });
    const problems: string[] = [];
    const record = (name: string, found: string[]) => {
      for (const problem of found) problems.push(`${name}: ${problem}`);
    };

    // Welcome: a first visit with nothing stored.
    await flow.navigate(baseURL, { name: "Welcome" });

    // Connect the fixture and save the connection with a passphrase, so the next visit shows Unlock. This is not measured.
    await page.getByRole("button", { name: "Connect a bucket" }).click();
    await page.getByRole("button", { name: "Other S3-compatible service" }).click();
    await page.getByLabel("Endpoint URL").fill("http://127.0.0.1:9000");
    await page.getByLabel("Access Key ID").fill(admin.accessKeyId);
    await page.getByLabel("Secret Access Key").fill(admin.secretAccessKey);
    await page.getByLabel("Bucket", { exact: true }).fill(E2E_BUCKET);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Save with a passphrase" }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    // A return visit has the app's files in the HTTP cache; the budget is for a cold load, so the cache is emptied (the saved connection is not).
    const session = await lhPage.createCDPSession();
    await session.send("Network.clearBrowserCache");
    await session.detach();

    // Unlock: a return visit with a saved connection. Storage is kept, or the saved connection would be wiped before the load.
    await flow.navigate(baseURL, { name: "Unlock", disableStorageReset: true });
    await expect(page.getByLabel("Passphrase")).toBeVisible();

    // Files: open the folder and scroll the list. A timespan, because the screen needs the unlocked session in memory.
    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 30_000 });
    await flow.startTimespan({ name: "Files" });
    await page.evaluate(() => {
      window.location.hash = "#/files";
    });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (let step = 0; step < 4; step += 1) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(250);
    }
    await flow.endTimespan();

    const result = await flow.createFlowResult();
    writeFileSync(join(REPORT_DIR, "flow.json"), JSON.stringify(result));

    const [welcome, unlock, files] = result.steps;
    if (welcome === undefined || unlock === undefined || files === undefined) throw new Error("A step is missing from the flow result");
    record("Welcome", checkNavigation(welcome.lhr as unknown as LhrLike));
    record("Unlock", checkNavigation(unlock.lhr as unknown as LhrLike, UNLOCK));
    record("Files", checkInteraction(files.lhr as unknown as LhrLike));
    writeFileSync(join(REPORT_DIR, "summary.json"), JSON.stringify({ problems }, null, 2));
    expect(problems, problems.join("\n")).toEqual([]);
    await browser.disconnect();
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
