import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { admin, s3Fixture, testUsers } from "../integration/config";
import { APP_ORIGIN, E2E_BUCKET } from "./fixture";

export type Layout = "compact" | "rail" | "sidebar";

/** The design breakpoints: compact below 768, rail 768 to 1023, sidebar from 1024. */
export function layoutFor(testInfo: TestInfo): Layout {
  const width = testInfo.project.use.viewport?.width ?? 0;
  if (width < 768) return "compact";
  return width < 1024 ? "rail" : "sidebar";
}

export const destinations = ["Home", "Files", "Starred", "Trash", "Storage", "Settings"] as const;
export type DestinationName = (typeof destinations)[number];

const routeFor: Record<DestinationName, RegExp> = {
  // The index route has no path, so the URL carries no hash (or just "#/").
  Home: /\/(#\/)?$/,
  Files: /#\/files$/,
  Starred: /#\/starred$/,
  Trash: /#\/trash$/,
  Storage: /#\/storage$/,
  Settings: /#\/settings$/,
};

export const hashFor = (name: DestinationName) => routeFor[name];

/** Starts every page with a recorder for Content-Security-Policy violations. */
export async function recordCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __csp: string[] };
    store.__csp = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      store.__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

/** Console errors and uncaught page errors, collected for the lifetime of the page. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    // The connection test probes the endpoint root; the S3 fixture answers HEAD / with 501, which the browser logs.
    if (message.type() === "error" && !message.text().includes('status of 501 (Not Implemented)')) errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

/** Emulates a provider whose bucket list answers CORS preflights, which the fixture's service-level call does not. */
export async function allowBucketList(page: Page): Promise<void> {
  const cors = {
    "access-control-allow-origin": APP_ORIGIN,
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, HEAD",
    "access-control-expose-headers": "ETag, Date, x-amz-bucket-region",
  };
  const root = new URL(s3Fixture.endpoint);
  await page.route((url) => url.origin === root.origin && url.pathname === "/", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
  });
}

/** Click a destination in whatever navigation is visible at this width. */
export async function navigateTo(page: Page, layout: Layout, name: DestinationName): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  if (layout !== "compact") {
    await nav.getByRole("link", { name }).click();
    return;
  }
  if (name === "Home" || name === "Files" || name === "Starred") {
    await nav.getByRole("link", { name }).click();
    return;
  }
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("link", { name }).click();
}

export interface ConnectOptions {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  /** Save the connection on this device with this passphrase (O51). Without it the person chooses "Not now". */
  passphrase?: string;
}

/** Fill the open "Other S3-compatible service" form against the fixture and press Connect. */
export async function fillCustomForm(page: Page, options: ConnectOptions = {}): Promise<void> {
  await page.getByLabel("Endpoint URL").fill(options.endpoint ?? s3Fixture.endpoint);
  await page.getByLabel("Access Key ID").fill(options.accessKeyId ?? admin.accessKeyId);
  await page.getByLabel("Secret Access Key").fill(options.secretAccessKey ?? admin.secretAccessKey);
  await page.getByLabel("Bucket", { exact: true }).fill(options.bucket ?? E2E_BUCKET);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
}

/** From Welcome to the connection test, through the real screens: Other S3-compatible service against the fixture. */
export async function connectCustom(page: Page, options: ConnectOptions = {}): Promise<void> {
  await page.getByRole("button", { name: "Connect a bucket" }).click();
  await page.getByRole("button", { name: "Other S3-compatible service" }).click();
  await fillCustomForm(page, options);
}

/**
 * Open the app on a route as a connected person. The session is memory-only, so
 * every test starts at Welcome and connects to the fixture first. The route is
 * set through the hash, never with a reload, which would drop the keys.
 */
/**
 * From the passed connection test to the app: "Open bucket", then O51. By default "Not now" (the keys stay in memory); with
 * a passphrase the connection is saved on this device, encrypted (FR-8).
 */
export async function openBucket(page: Page, passphrase?: string): Promise<void> {
  await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
  if (passphrase === undefined) {
    await page.getByRole("button", { name: "Not now" }).click();
    return;
  }
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Save with a passphrase" }).click();
}

export async function enterApp(page: Page, route = "/files", options: ConnectOptions = {}): Promise<void> {
  await page.goto("/");
  await connectCustom(page, options);
  await openBucket(page, options.passphrase);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await goToRoute(page, route);
}

/**
 * Open the app with the fixture's read-only key (FR-110, FR-111): the test finds list and read pass and write denied, offers
 * "Connect read-only", and the connection is kept in memory ("Not now").
 */
export async function enterReadOnlyApp(page: Page, route = "/files"): Promise<void> {
  await page.goto("/");
  await connectCustom(page, { ...testUsers.readOnly });
  await page.getByRole("button", { name: "Connect read-only" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await goToRoute(page, route);
}

export async function goToRoute(page: Page, route: string): Promise<void> {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, `#${route}`);
}

/**
 * Contrast is measured on the final colors, so wait for the open animation to end first. A cancelled animation (a sheet that
 * was rebuilt under it) rejects `finished`; it is over either way, and the animation that replaced it is waited for in the next round.
 */
async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // An animation that a dialog's opening starts begins on the next frame, so look after two of them.
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });
    for (let round = 0; round < 5; round += 1) {
      const running = document
        .getAnimations()
        // A spinner repeats forever and never finishes.
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState !== "finished");
      if (running.length === 0) return;
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    }
  });
}

/**
 * axe for this page. In Firefox the content process crashed under axe on a few screens in CI (Settings, the Move dialog, the
 * Security page), also with colour-contrast off, so the two rules that measure the most (colour-contrast and target-size) are
 * left out there. Contrast is measured in all three engines, Firefox included, from the real computed colours by
 * contrast.spec.ts, and both rules still run in Chromium and WebKit (D-50).
 */
export function axeFor(page: Page): AxeBuilder {
  const builder = new AxeBuilder({ page });
  return page.context().browser()?.browserType().name() === "firefox" ? builder.disableRules(["color-contrast", "target-size"]) : builder;
}

export async function axeViolations(page: Page) {
  await settled(page);
  const result = await axeFor(page).analyze();
  return result.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
  }));
}

