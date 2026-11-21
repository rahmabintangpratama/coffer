import { expect, test } from "@playwright/test";
import { axeViolations as violations, enterApp, layoutFor } from "./helpers";

const routes = ["/", "/files", "/starred", "/trash", "/storage", "/settings"] as const;
const themes = ["light", "dark"] as const;

test.describe("accessibility (axe, WCAG 2.2 A and AA)", () => {
  for (const colorScheme of themes) {
    for (const route of routes) {
      test(`${route} in ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await enterApp(page, route);
        await expect(page.locator("h1")).toBeVisible();
        expect(await violations(page)).toEqual([]);
      });
    }

    test(`open drawer and More sheet in ${colorScheme}`, async ({ page }, testInfo) => {
      test.skip(layoutFor(testInfo) !== "compact", "drawer and More sheet exist only below 768 px");
      await page.emulateMedia({ colorScheme });
      await enterApp(page, "/");

      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("dialog", { name: "Main navigation" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "More" }).click();
      await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }
});
