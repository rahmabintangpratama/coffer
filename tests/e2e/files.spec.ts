import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { BIG_BUCKET } from "./fixture";
import { collectErrors, enterApp, layoutFor, type Layout } from "./helpers";

// M3 exit check: browse a bucket of 12,000 objects (FR-20, FR-21, FR-23, FR-30,
// FR-37, FR-27). The e2e build lowers the Load all cap to 3,000.
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();

async function openMenuItem(page: Page, layout: Layout, fileName: string, item: string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${fileName}` }).first().click();
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: item }).click();
  else await page.getByRole("menuitem", { name: item }).click();
}

test.describe("browse a big bucket", () => {
  test.beforeEach(async ({ page }) => {
    await enterApp(page, "/files", { bucket: BIG_BUCKET });
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 30_000 });
  });

  test("AC-21.1 and AC-20.4 show 2,000 items with the banner and keep the DOM small", async ({ page }) => {
    await expect(page.getByText("Showing 2,000 items")).toBeVisible();
    await expect(page.getByRole("button", { name: "Load all" })).toBeVisible();
    const count = await rows(page).count();
    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThan(80);
    // A row far down the list exists only after scrolling to it.
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await expect(page.getByRole("grid")).toBeVisible();
    expect(await rows(page).count()).toBeLessThan(80);
  });

  test("AC-21.3 Load all stops at the cap and says the list is incomplete", async ({ page }) => {
    await page.getByRole("button", { name: "Load all" }).click();
    await expect(page.getByText("Showing the first 3,000 items")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Load all" })).toHaveCount(0);
  });

  test("AC-21.4 sorting by size while partial says it only orders what is loaded", async ({ page }) => {
    await page.getByLabel("Sort by").selectOption("size");
    await expect(page.getByText(/only orders the items loaded so far/)).toBeVisible();
  });

  test("AC-21.1 a folder of exactly 2,000 items has no banner", async ({ page }) => {
    await page.evaluate(() => { window.location.hash = "#/files/exact"; });
    await expect(row(page, "e-00000.txt")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Load all" })).toHaveCount(0);
    await expect(page.getByText(/Showing .* items/)).toHaveCount(0);
    await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", /.+/);
  });

  test("AC-23.1 search narrows loaded items by name without a request", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => { if (request.url().includes(BIG_BUCKET)) requests.push(request.url()); });
    await page.getByRole("searchbox").fill("f-00042");
    await expect(row(page, "f-00042.txt")).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    expect(requests).toEqual([]);
  });

  test("AC-23.3 no match shows the empty result with Clear filters", async ({ page }) => {
    await page.getByRole("searchbox").fill("zzz-no-such-file");
    await expect(page.getByRole("heading", { name: "No results for “zzz-no-such-file”" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(rows(page).first()).toBeVisible();
  });

  test("AC-23.2 type chips narrow the list and set aria-pressed", async ({ page }, testInfo) => {
    await page.evaluate(() => { window.location.hash = "#/files/awkward"; });
    await expect(row(page, "hello.txt")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Type", exact: true }).click();
    const layout = layoutFor(testInfo);
    if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: "Images" }).click();
    else await page.getByRole("menuitem", { name: "Images" }).click();
    await expect(page.getByRole("button", { name: "Type: Images" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: /No results/ })).toBeVisible();
  });

  test("AC-22.5 and AC-20.6 open a folder with awkward names, and the path is in the hash", async ({ page }, testInfo) => {
    const folder = row(page, "awkward");
    if (layoutFor(testInfo) === "compact") await folder.click();
    else await folder.dblclick();
    await expect(page).toHaveURL(/#\/files\/awkward$/);
    for (const name of ["#hash.txt", "q?mark.txt", "100%.txt", "plus+sign.txt", "日本語.txt"]) {
      await expect(row(page, name)).toBeVisible();
    }
    await expect(page.getByRole("navigation", { name: "Folder path" })).toContainText(BIG_BUCKET);
  });

  test("AC-37.1 downloads a file with its own name from a presigned URL", async ({ page }, testInfo) => {
    await page.evaluate(() => { window.location.hash = "#/files/awkward"; });
    await expect(row(page, "hello.txt")).toBeVisible({ timeout: 30_000 });
    const layout = layoutFor(testInfo);
    const downloadPromise = page.waitForEvent("download");
    await openMenuItem(page, layout, "hello.txt", "Download");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("hello.txt");
    expect(download.url()).toContain("X-Amz-Signature");
  });

  test("AC-27.1 details shows the key and a content type read with HEAD", async ({ page }, testInfo) => {
    await page.evaluate(() => { window.location.hash = "#/files/awkward"; });
    await expect(row(page, "hello.txt")).toBeVisible({ timeout: 30_000 });
    await openMenuItem(page, layoutFor(testInfo), "hello.txt", "Details");
    const panel = page.locator('[data-component="DetailsPanel"]');
    await expect(panel.getByText("awkward/hello.txt")).toBeVisible();
    await expect(panel.getByText(/text\/plain|application\/octet-stream/)).toBeVisible();
  });

  test("AC-20.3 the grid layout shows folder and file tiles", async ({ page }) => {
    await page.getByRole("button", { name: "Grid layout" }).click();
    await expect(page.locator('[data-component="FolderTile"]').first()).toBeVisible();
    await expect(page.locator('[data-component="FileTile"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Grid layout" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a list and grid pass axe", async ({ page }) => {
    const list = await new AxeBuilder({ page }).analyze();
    expect(list.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await page.getByRole("button", { name: "Grid layout" }).click();
    await expect(page.locator('[data-component="FileTile"]').first()).toBeVisible();
    const grid = await new AxeBuilder({ page }).analyze();
    expect(grid.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});

test.describe("selection and keyboard on a pointer device", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(layoutFor(testInfo) === "compact", "Touch selection is a long press.");
    await enterApp(page, "/files", { bucket: BIG_BUCKET });
    await page.evaluate(() => { window.location.hash = "#/files/folder-0"; });
    await expect(row(page, "g-00000.txt")).toBeVisible({ timeout: 30_000 });
  });

  test("AC-30.1 click selects, Ctrl-click toggles, Shift-click ranges, Esc clears", async ({ page }) => {
    await row(page, "g-00001.txt").click();
    await expect(row(page, "g-00001.txt")).toHaveAttribute("aria-selected", "true");
    await row(page, "g-00003.txt").click({ modifiers: ["ControlOrMeta"] });
    await expect(page.getByRole("status").filter({ hasText: "2 selected" })).toBeVisible();
    await row(page, "g-00005.txt").click({ modifiers: ["Shift"] });
    await expect(page.getByRole("status").filter({ hasText: "3 selected" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar", { name: "Selection actions" })).toHaveCount(0);
  });

  test("AC-20.5 arrow keys move focus and the list is one tab stop", async ({ page }) => {
    await row(page, "g-00000.txt").focus();
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "g-00001.txt")).toBeFocused();
    expect(await page.locator('[data-component="FileRow"][tabindex="0"]').count()).toBe(1);
    await page.keyboard.press("End");
    await expect(row(page, "g-00499.txt")).toBeFocused();
  });

  test("AC-23.4 slash focuses the search pill; Esc clears then blurs", async ({ page }) => {
    // The pill is in the app bar and loads with it; the shortcut needs it to exist.
    await expect(page.getByRole("searchbox")).toBeVisible();
    await row(page, "g-00000.txt").focus();
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox")).toBeFocused();
    await page.keyboard.type("g-00007");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("searchbox")).not.toBeFocused();
  });
});

test("the files screen logs no console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await enterApp(page, "/files", { bucket: BIG_BUCKET });
  await expect(page.getByRole("grid")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
