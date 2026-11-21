import { expect, test, type Page } from "@playwright/test";

const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));

test.describe("theme", () => {
  test("a chosen theme applies, is saved and survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/#/settings");
    await page.getByRole("radio", { name: "Dark" }).check();
    expect(await theme(page)).toBe("dark");
    expect(await page.evaluate(() => localStorage.getItem("coffer:theme"))).toBe("dark");

    await page.reload();
    expect(await theme(page)).toBe("dark");
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();

    await page.getByRole("radio", { name: "Light" }).check();
    expect(await theme(page)).toBe("light");
  });

  test("System follows the operating system and updates live", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/#/settings");
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    expect(await theme(page)).toBe("dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => theme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => theme(page)).toBe("dark");
  });

  test("an explicit choice ignores the operating system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/#/settings");
    await page.getByRole("radio", { name: "Light" }).check();
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await theme(page)).toBe("light");
  });

  test("the saved theme is set before the page body exists (no flash)", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("coffer:theme", "dark");
    });
    await page.addInitScript(() => {
      const store = window as unknown as { __themeAtBody?: string | null };
      // Observe the document, which exists before <html> does, and note the theme the moment <body> appears.
      new MutationObserver((_records, observer) => {
        // document.body is typed as always present, but it is null until the parser reaches <body>.
        if ((document.body as HTMLElement | null) !== null) {
          store.__themeAtBody = document.documentElement.getAttribute("data-theme");
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/");
    const atBody = await page.evaluate(() => (window as unknown as { __themeAtBody?: string | null }).__themeAtBody);
    expect(atBody).toBe("dark");
  });

  test("the design tokens switch with the theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    // bg.app is gray.100 in light and gray.975 in dark.
    await expect(page.locator(".cf-app")).toHaveCSS("background-color", "rgb(239, 237, 233)");
    await page.goto("/#/settings");
    await page.getByRole("radio", { name: "Dark" }).check();
    await expect(page.locator(".cf-app")).toHaveCSS("background-color", "rgb(18, 17, 16)");
  });

  test("text uses the self-hosted IBM Plex Sans", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cf-app")).toHaveCSS("font-family", /IBM Plex Sans/);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px "IBM Plex Sans"');
    });
    expect(loaded).toBe(true);
  });
});
