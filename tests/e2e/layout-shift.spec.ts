import { expect, test } from "./test";
import { enterApp } from "./helpers";

// A page that moves under a tap sends the tap to the wrong element. The Files bar is a lazy chunk; its height
// must not change when the chunk arrives (found as a flaky "More actions" tap in operations.spec, webkit-375).
// The recorder samples every frame, so the test does not depend on which of the screen and the chunk comes first.
test("the Files app bar keeps one height from the first frame of the Files screen to the end", async ({ page }) => {
  await page.route("**/assets/AppBarContent-*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  await page.addInitScript(() => {
    const seen = new Set<number>();
    (window as unknown as { __barHeights: Set<number> }).__barHeights = seen;
    const sample = () => {
      const bar = document.querySelector('header[data-component="AppBar"]');
      if (bar && document.querySelector('[data-component="FilesScreen"]')) seen.add(Math.round(bar.getBoundingClientRect().height));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await enterApp(page, "/files");
  await expect(page.locator('[data-component="FilesAppBar"]')).toBeVisible({ timeout: 15_000 });
  // Let a few frames pass after the chunk, so a late change would be seen.
  await page.evaluate(() => new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); }));
  const heights = await page.evaluate(() => [...(window as unknown as { __barHeights: Set<number> }).__barHeights]);
  expect(heights).toHaveLength(1);
});
