import { expect, test } from "@playwright/test";
import { destinations, enterApp, goToRoute, hashFor, layoutFor, navigateTo } from "./helpers";

test.describe("navigation shell", () => {
  test.beforeEach(async ({ page }) => {
    await enterApp(page, "/");
  });

  test("shows the navigation that belongs to this width", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    const bottom = page.locator('[data-component="BottomNav"]');
    const rail = page.locator('[data-component="NavRail"]');
    const sidebar = page.locator('[data-component="Sidebar"]');
    const menu = page.getByRole("button", { name: "Open menu" });

    await expect(bottom).toBeVisible({ visible: layout === "compact" });
    await expect(menu).toBeVisible({ visible: layout === "compact" });
    await expect(rail).toBeVisible({ visible: layout === "rail" });
    await expect(sidebar).toBeVisible({ visible: layout === "sidebar" });
  });

  test("the layout follows the container width: rail is 80 px, sidebar is 256 px", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    if (layout === "rail") {
      const box = await page.locator('[data-component="NavRail"]').boundingBox();
      expect(box?.width).toBe(80);
    }
    if (layout === "sidebar") {
      const box = await page.locator('[data-component="Sidebar"]').boundingBox();
      expect(box?.width).toBe(256);
    }
  });

  test("has no horizontal scroll and a visible page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("every control in the shell is a large enough target", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    // 44 px on mobile (design), 24 px minimum elsewhere (WCAG 2.5.8).
    const minimum = layout === "compact" ? 44 : 24;
    const controls = page.locator("header button, nav a, nav button");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      if (!(await control.isVisible())) continue;
      const box = await control.boundingBox();
      const name = (await control.getAttribute("aria-label")) ?? (await control.innerText());
      expect(box?.width, `${name} width`).toBeGreaterThanOrEqual(minimum);
      expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(minimum);
    }
  });

  test("every destination opens its screen with the right heading, title and current marker", async ({
    page,
  }, testInfo) => {
    const layout = layoutFor(testInfo);
    let previous = "Home"; // the app opens on Home
    for (const name of destinations) {
      await navigateTo(page, layout, name);
      await expect(page).toHaveURL(hashFor(name));
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page).toHaveTitle(`${name} · Coffer`);
      // Focus moves to the page after a navigation to a different screen.
      if (name !== previous) await expect(page.locator("main")).toBeFocused();
      previous = name;
      const current = page.getByRole("navigation", { name: "Main navigation" }).locator('[aria-current="page"]');
      if (layout !== "compact" || ["Home", "Files", "Starred"].includes(name)) {
        await expect(current).toHaveText(name);
      }
    }
  });

  test("an unknown address shows a not-found screen with a way back", async ({ page }) => {
    await goToRoute(page, "/no-such-screen");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page).toHaveTitle("Coffer");
    await page.getByRole("link", { name: "Go to Home" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  });

  test("a sub-path keeps its parent destination current", async ({ page }, testInfo) => {
    test.skip(layoutFor(testInfo) === "compact", "checked on the rail and sidebar");
    await goToRoute(page, "/files");
    await expect(page.getByRole("navigation", { name: "Main navigation" }).locator('[aria-current="page"]')).toHaveText("Files");
  });

  test("a reload keeps the route in the hash and returns to Welcome, because the session is memory-only", async ({ page }, testInfo) => {
    // Saved connections (M8) will bring the person back to this screen; until then the keys are gone after a reload.
    await navigateTo(page, layoutFor(testInfo), "Files");
    await page.reload();
    await expect(page).toHaveURL(/#\/files$/);
    await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible();
  });

  test("the skip button appears on focus and moves focus to the page", async ({ page }) => {
    const skip = page.getByRole("button", { name: "Skip to content" });
    // Safari does not Tab to buttons by default, so focus it directly here; the Tab order is checked in Chromium below.
    await skip.focus();
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });

  test("the skip button is the first stop in the Tab order", async ({ page }) => {
    // Entering the app leaves the keyboard start point where onboarding ended, so the order is read from the DOM
    // (the first tabbable element) instead of pressing Tab from an unknown place.
    const first = await page.evaluate(() => {
      const tabbable = [...document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]')].find(
        (element) => element.tabIndex >= 0,
      );
      return tabbable?.textContent;
    });
    expect(first).toBe("Skip to content");
  });

  test.describe("below 768 px", () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "drawer and More sheet exist only below 768 px");

    test("the drawer opens, traps focus, closes on Escape and returns focus", async ({ page }) => {
      const menu = page.getByRole("button", { name: "Open menu" });
      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Main navigation" });
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("data-surface", "elevated");
      const inside = await page.evaluate(() => document.activeElement?.closest("dialog") !== null);
      expect(inside).toBe(true);
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(menu).toBeFocused();
    });

    test("the drawer is at most 320 px wide and lists every destination", async ({ page }) => {
      await page.getByRole("button", { name: "Open menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Main navigation" });
      const box = await drawer.locator(".cf-panel").boundingBox();
      expect(Math.round(box?.width ?? 0)).toBeLessThanOrEqual(320);
      for (const name of destinations) {
        await expect(drawer.getByRole("link", { name })).toBeVisible();
      }
    });

    test("the drawer closes on a tap on the scrim", async ({ page }) => {
      await page.getByRole("button", { name: "Open menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Main navigation" });
      await expect(drawer).toBeVisible();
      const viewport = page.viewportSize();
      await page.mouse.click((viewport?.width ?? 375) - 8, 300);
      await expect(drawer).toBeHidden();
    });

    test("the drawer closes on a swipe to the left", async ({ page }) => {
      await page.getByRole("button", { name: "Open menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Main navigation" });
      await expect(drawer).toBeVisible();
      await page.mouse.move(250, 400);
      await page.mouse.down();
      await page.mouse.move(180, 405, { steps: 5 });
      await page.mouse.move(100, 405, { steps: 5 });
      await page.mouse.up();
      await expect(drawer).toBeHidden();
    });

    test("choosing a destination in the drawer navigates and closes it", async ({ page }) => {
      await page.getByRole("button", { name: "Open menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Main navigation" });
      await drawer.getByRole("link", { name: "Storage" }).click();
      await expect(drawer).toBeHidden();
      await expect(page.getByRole("heading", { level: 1, name: "Storage" })).toBeVisible();
    });

    test("the More sheet lists Trash, Storage and Settings, closes on Escape and returns focus", async ({ page }) => {
      const more = page.getByRole("button", { name: "More" });
      await more.click();
      const sheet = page.getByRole("dialog", { name: "More" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Trash" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Storage" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Files" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(more).toBeFocused();
    });

    test("the More sheet sits at the bottom edge", async ({ page }) => {
      await page.getByRole("button", { name: "More" }).click();
      const panel = page.getByRole("dialog", { name: "More" }).locator(".cf-panel");
      const box = await panel.boundingBox();
      const viewport = page.viewportSize();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1);
    });
  });

  test("the sidebar collapses to icons and expands again", async ({ page }, testInfo) => {
    test.skip(layoutFor(testInfo) !== "sidebar", "the sidebar exists from 1024 px");
    const sidebar = page.locator('[data-component="Sidebar"]');
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect((await sidebar.boundingBox())?.width).toBe(80);
    // The labels are gone from view but still name the links.
    await expect(sidebar.getByRole("link", { name: "Files" })).toBeVisible();
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect((await sidebar.boundingBox())?.width).toBe(256);
  });
});
