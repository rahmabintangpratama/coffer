import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { enterApp } from "./helpers";

// M11: grid thumbnails for raster images, from presigned GETs, lazily, with the type icon as the fallback.
// Fixtures are under preview/ in the shared bucket (tests/e2e/fixture.ts): sample.png is a real PNG, mislabeled.png is text.
const tile = (page: Page, name: string) => page.locator('[data-component="FileTile"]').filter({ hasText: name }).first();

test("M11 an image tile shows a thumbnail; a broken image and other files keep their icon", async ({ page }) => {
  const gets: string[] = [];
  page.on("request", (request) => { if (request.method() === "GET" && request.url().includes("X-Amz-Signature")) gets.push(request.url()); });
  await enterApp(page, "/files");
  await page.evaluate(() => { window.location.hash = "#/files/preview"; });
  await page.getByRole("button", { name: "Grid layout" }).click();
  // Thumbnails load only near the viewport: bring the tile there first (it is below the fold on a phone).
  await tile(page, "sample.png").scrollIntoViewIfNeeded();
  const picture = tile(page, "sample.png").locator('[data-component="Thumbnail"] img');
  await expect(picture).toBeVisible({ timeout: 20_000 });
  await expect(picture).toHaveAttribute("src", /^blob:/);
  await expect(picture).toHaveAttribute("alt", "");
  await expect.poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  // A presigned GET fetched it.
  expect(gets.some((url) => url.includes("sample.png"))).toBe(true);
  // Text named .png cannot be decoded: the icon stays, and nothing is logged as an error (the guard fixture checks the console).
  await tile(page, "mislabeled.png").scrollIntoViewIfNeeded();
  await expect(tile(page, "mislabeled.png").locator('[data-component="Thumbnail"] svg')).toBeVisible();
  await expect(tile(page, "mislabeled.png").locator("img")).toHaveCount(0);
  await expect(tile(page, "code.ts").locator("img")).toHaveCount(0);
});
