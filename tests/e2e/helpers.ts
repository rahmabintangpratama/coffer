import { expect, type Page, type TestInfo } from "@playwright/test";
import { admin, s3Fixture } from "../integration/config";
import { E2E_BUCKET } from "./fixture";

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
}

/** From Welcome to the connection test, through the real screens: Other S3-compatible service against the fixture. */
export async function connectCustom(page: Page, options: ConnectOptions = {}): Promise<void> {
  await page.getByRole("button", { name: "Connect a bucket" }).click();
  await page.getByRole("button", { name: "Other S3-compatible service" }).click();
  await page.getByLabel("Endpoint URL").fill(options.endpoint ?? s3Fixture.endpoint);
  await page.getByLabel("Access Key ID").fill(options.accessKeyId ?? admin.accessKeyId);
  await page.getByLabel("Secret Access Key").fill(options.secretAccessKey ?? admin.secretAccessKey);
  if (options.bucket !== "") await page.getByLabel("Bucket", { exact: true }).fill(options.bucket ?? E2E_BUCKET);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
}

/**
 * Open the app on a route as a connected person. The session is memory-only, so
 * every test starts at Welcome and connects to the fixture first. The route is
 * set through the hash, never with a reload, which would drop the keys.
 */
export async function enterApp(page: Page, route = "/files"): Promise<void> {
  await page.goto("/");
  await connectCustom(page);
  await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await goToRoute(page, route);
}

export async function goToRoute(page: Page, route: string): Promise<void> {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, `#${route}`);
}
