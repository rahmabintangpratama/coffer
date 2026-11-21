import type { Page, TestInfo } from "@playwright/test";

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
    if (message.type() === "error") errors.push(message.text());
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
