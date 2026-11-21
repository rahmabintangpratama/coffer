import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { layoutFor } from "./helpers";

const routes = ["#/", "#/files", "#/starred", "#/trash", "#/storage", "#/settings"] as const;
const themes = ["light", "dark"] as const;

/** Contrast is measured on the final colors, so wait for the open animation to end first. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
}

async function violations(page: Page) {
  await settled(page);
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
  }));
}

test.describe("accessibility (axe, WCAG 2.2 A and AA)", () => {
  for (const colorScheme of themes) {
    for (const route of routes) {
      test(`${route} in ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(`/${route}`);
        await expect(page.locator("h1")).toBeVisible();
        expect(await violations(page)).toEqual([]);
      });
    }

    test(`open drawer and More sheet in ${colorScheme}`, async ({ page }, testInfo) => {
      test.skip(layoutFor(testInfo) !== "compact", "drawer and More sheet exist only below 768 px");
      await page.emulateMedia({ colorScheme });
      await page.goto("/");

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
