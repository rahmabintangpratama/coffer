import { expect, test } from "@playwright/test";
import { collectErrors, cspViolations, layoutFor, navigateTo, destinations, recordCspViolations } from "./helpers";

// The e2e server applies dist/_headers, so this runs under the real policy.
test.describe("Content Security Policy", () => {
  test("the document is served with the CSP and the other security headers", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};
    expect(headers["content-security-policy"]).toContain("default-src 'none'");
    expect(headers["content-security-policy"]).toContain("script-src 'self'");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test("using the whole shell causes no CSP violation and no console error", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    await recordCspViolations(page);
    const errors = collectErrors(page);

    await page.goto("/");
    for (const name of destinations) await navigateTo(page, layout, name);

    // Theme change, then layers (these create the most DOM and styles).
    await page.getByRole("radio", { name: "Dark" }).check();
    await page.getByRole("radio", { name: "System" }).check();
    if (layout === "compact") {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("dialog", { name: "Main navigation" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "More" }).click();
      await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    if (layout === "sidebar") {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    expect(await cspViolations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
