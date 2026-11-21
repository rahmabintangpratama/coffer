import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { cspViolations, enterApp, recordCspViolations } from "./helpers";

// M5a: the preview viewer for images, video, audio, text and code, SVG and the
// no-preview fallback (FR-50, FR-51, FR-52, FR-54, FR-57, FR-58). Fixtures are
// seeded under preview/ in the shared bucket by tests/e2e/fixture.ts.
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
const dialog = (page: Page) => page.locator('dialog[data-component="Preview"]');
const FILE_COUNT = 10;

async function openFile(page: Page, name: string): Promise<void> {
  const target = row(page, name);
  await expect(target).toBeVisible();
  await target.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
}

test.describe("preview", () => {
  test.beforeEach(async ({ page }) => {
    await recordCspViolations(page);
    await enterApp(page, "/files");
    await page.evaluate(() => { window.location.hash = "#/files/preview"; });
    await expect(row(page, "sample.png")).toBeVisible({ timeout: 20_000 });
  });

  test("AC-51.1 and AC-50.3 an image opens in a dialog named after it, and focus returns to its row on Escape", async ({ page }) => {
    await openFile(page, "sample.png");
    await expect(page.getByRole("dialog", { name: "Preview of sample.png" })).toBeVisible();
    const image = dialog(page).getByRole("img", { name: "Preview of sample.png" });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(row(page, "sample.png")).toBeFocused();
  });

  test("AC-50.2 arrow keys move between files and announce the position", async ({ page }) => {
    await openFile(page, "code.ts");
    // Ten files in name order: big.txt, blob.bin, code.ts, hostile.svg, hostile.txt, mislabeled.png, README, sample.*.
    await expect(dialog(page).getByRole("status").filter({ hasText: / of / })).toHaveText(`3 of ${FILE_COUNT.toString()}`);
    await page.keyboard.press("ArrowRight");
    await expect(dialog(page).getByRole("heading", { level: 1 })).toHaveText("hostile.svg");
    await expect(dialog(page).getByRole("status").filter({ hasText: / of / })).toHaveText(`4 of ${FILE_COUNT.toString()}`);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(dialog(page).getByRole("heading", { level: 1 })).toHaveText("blob.bin");
  });

  test("AC-50.1 Back in the browser closes the viewer and keeps the folder", async ({ page }) => {
    await openFile(page, "sample.png");
    await page.keyboard.press("ArrowRight");
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/files\/preview$/);
  });

  test("AC-22.5 the open file is in the address fragment, never in the query string", async ({ page }) => {
    await openFile(page, "code.ts");
    const url = new URL(page.url());
    expect(url.search).toBe("");
    expect(url.hash).toContain("?preview=preview%2Fcode.ts");
  });

  test("AC-54.1 code shows line numbers, the meta line and the text", async ({ page }) => {
    await openFile(page, "code.ts");
    await expect(dialog(page).getByText("Code or text · 2 lines · 55 B")).toBeVisible();
    await expect(dialog(page).getByRole("region", { name: "Preview of code.ts" })).toContainText("export const answer: number = 42;");
    await expect(dialog(page).locator("pre[aria-hidden='true']")).toHaveText("1\n2");
  });

  test("AC-54.2 a file over 1 MiB says only the beginning is shown", async ({ page }) => {
    await openFile(page, "big.txt");
    await expect(dialog(page).getByText("Only the first 1 MiB is shown.")).toBeVisible();
  });

  test("AC-54.3 hostile text is shown as text and nothing runs", async ({ page }) => {
    await openFile(page, "hostile.txt");
    const region = dialog(page).getByRole("region", { name: "Preview of hostile.txt" });
    await expect(region).toContainText("<script>window.__textRan = true</script>");
    await expect(region).toContainText('<a href="javascript:window.__textRan = true">click</a>');
    expect(await dialog(page).locator("script, img, a, iframe").count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __textRan?: boolean }).__textRan)).toBeUndefined();
  });

  test("AC-57.1 an SVG with a script, handlers and remote references stays inert, drawn as a blob image", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => { requests.push(request.url()); });
    await openFile(page, "hostile.svg");
    const image = dialog(page).getByRole("img", { name: "Preview of hostile.svg" });
    await expect(image).toBeVisible();
    expect(await image.getAttribute("src")).toMatch(/^blob:/);
    await expect(dialog(page).getByText("SVG · shown as an image, scripts never run")).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __svgRan?: boolean }).__svgRan)).toBeUndefined();
    expect(await page.title()).not.toBe("pwned");
    expect(requests.filter((url) => url.includes("attacker.invalid"))).toEqual([]);
    expect(await dialog(page).locator("svg[onload], script, iframe, foreignObject").count()).toBe(0);
  });

  test("AC-58.1 an unknown binary says it cannot be shown and offers Download", async ({ page }) => {
    await openFile(page, "blob.bin");
    await expect(dialog(page).getByRole("heading", { name: "No preview for this file type" })).toBeVisible();
    await expect(dialog(page).getByText("BIN files can’t be shown in the browser. You can still download the file.")).toBeVisible();
    const download = page.waitForEvent("download");
    await dialog(page).locator("[data-component='NoPreview']").getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("blob.bin");
  });

  test("FR-50 a file with no extension is read by its first bytes and shown as text", async ({ page }) => {
    await openFile(page, "README");
    await expect(dialog(page).getByRole("region", { name: "Preview of README" })).toContainText("notes without an extension");
  });

  test("AC-51.2 text named .png falls to the fallback instead of a broken image", async ({ page }) => {
    await openFile(page, "mislabeled.png");
    await expect(dialog(page).getByRole("heading", { name: "No preview for this file type" })).toBeVisible({ timeout: 15_000 });
  });

  test("AC-52.1 audio plays with native controls", async ({ page }) => {
    await openFile(page, "sample.wav");
    const audio = dialog(page).locator("audio");
    await expect(audio).toHaveAttribute("controls", "");
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0);
  });

  test("AC-52.1 video plays with native controls", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The fixture is WebM, which WebKit builds do not all play.");
    await openFile(page, "sample.webm");
    const video = dialog(page).locator("video");
    await expect(video).toHaveAttribute("controls", "");
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThan(0);
  });

  test("AC-51.1 zoom buttons enlarge the image and Fit returns it", async ({ page }) => {
    await openFile(page, "sample.png");
    const image = dialog(page).getByRole("img", { name: "Preview of sample.png" });
    await dialog(page).getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => image.evaluate((element) => element.style.transform)).toContain("scale(1.5)");
    await dialog(page).getByRole("button", { name: "Fit to screen" }).click();
    await expect.poll(() => image.evaluate((element) => element.style.transform)).toContain("scale(1)");
  });

  test("previewing an image, an SVG, text and audio causes no CSP violation", async ({ page }) => {
    for (const name of ["sample.png", "hostile.svg", "code.ts", "sample.wav"]) {
      await openFile(page, name);
      await expect(dialog(page).locator("img, audio, [role='region']").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toHaveCount(0);
    }
    expect(await cspViolations(page)).toEqual([]);
  });

  test("the viewer passes axe for text and image, and traps focus", async ({ page }) => {
    await openFile(page, "code.ts");
    await expect(dialog(page).getByText(/Code or text/)).toBeVisible();
    const text = await new AxeBuilder({ page }).include("dialog[data-component='Preview']").analyze();
    expect(text.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    for (let press = 0; press < 12; press += 1) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("dialog[data-component='Preview']") !== null)).toBe(true);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    const image = await new AxeBuilder({ page }).include("dialog[data-component='Preview']").analyze();
    expect(image.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
