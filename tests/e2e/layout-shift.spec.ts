import { expect, test } from "@playwright/test";
import { enterApp } from "./helpers";

// A page that moves under a tap sends the tap to the wrong element. The Files bar is a lazy chunk; its height
// must be the same before and after the chunk arrives (found as a flaky "More actions" tap in operations.spec).
test("the Files app bar keeps its height when its chunk arrives late", async ({ page }) => {
  await page.route("**/assets/AppBarContent-*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });
  await enterApp(page, "/files");
  const header = page.locator('header[data-component="AppBar"]');
  await expect(page.locator('[data-component="FilesScreen"]')).toBeVisible();
  await expect(page.locator('[data-component="FilesAppBar"]')).toHaveCount(0);
  const before = (await header.boundingBox())?.height;
  await expect(page.locator('[data-component="FilesAppBar"]')).toBeVisible({ timeout: 15_000 });
  const after = (await header.boundingBox())?.height;
  expect(before).toBeDefined();
  expect(after).toBe(before);
});
