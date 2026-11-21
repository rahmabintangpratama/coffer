import { expect, test } from "@playwright/test";

// M0 smoke test: the built app renders, the generated tokens apply, and the
// container query that lowers the base font size at 1024 px works in both engines.
test("renders the app name with the design tokens at every width", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Coffer" })).toBeVisible();

  const width = testInfo.project.use.viewport?.width ?? 0;
  const expectedFontSize = width >= 1024 ? "14px" : "15px";
  await expect(page.locator(".cf-app")).toHaveCSS("font-size", expectedFontSize);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
