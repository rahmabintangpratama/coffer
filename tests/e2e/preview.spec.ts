import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { expect, expectConsole, test } from "./test";
import { cspViolations, enterApp, recordCspViolations } from "./helpers";

// M5a and M5b: the preview viewer for images, video, audio, text and code, SVG, PDF,
// Markdown, HTML as source and the no-preview fallback (FR-50 to FR-58). Fixtures are
// seeded under preview/ in the shared bucket by tests/e2e/fixture.ts.
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
const dialog = (page: Page) => page.locator('dialog[data-component="Preview"]');
const FILE_COUNT = 14;

async function openFile(page: Page, name: string): Promise<void> {
  const target = row(page, name);
  await expect(target).toBeVisible();
  await target.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
}

/** Close with Escape and wait for the row to take focus back, so the next open does not race the focus move. */
async function closeViewer(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(row(page, name)).toBeFocused();
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
    // Fourteen files in name order: big.txt, blob.bin, code.ts, hostile.html, hostile.md, hostile.svg, hostile.txt, mislabeled.png, README, sample.*, scripted.pdf.
    await expect(dialog(page).getByRole("status").filter({ hasText: / of / })).toHaveText(`3 of ${FILE_COUNT.toString()}`);
    await page.keyboard.press("ArrowRight");
    await expect(dialog(page).getByRole("heading", { level: 1 })).toHaveText("hostile.html");
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
    // Chromium reports a failed image decode from a blob: as a connect-src block (loopback endpoints only; an https endpoint uses a presigned link).
    expectConsole(/^connect-src .*blob|Connecting to 'blob:/);
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
      await closeViewer(page, name);
    }
    expect(await cspViolations(page)).toEqual([]);
  });

  test("the text viewer passes axe", async ({ page }) => {
    await openFile(page, "code.ts");
    await expect(dialog(page).getByText(/Code or text/)).toBeVisible();
    const result = await new AxeBuilder({ page }).include("dialog[data-component='Preview']").analyze();
    expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });

  test("the image viewer passes axe", async ({ page }) => {
    await openFile(page, "sample.png");
    await expect(dialog(page).getByRole("img", { name: "Preview of sample.png" })).toBeVisible();
    const result = await new AxeBuilder({ page }).include("dialog[data-component='Preview']").analyze();
    expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });

  // Tab is not a reliable way to prove a trap: a native dialog lets Tab leave for the browser's own UI, and engines differ
  // on whether Tab reaches buttons at all (WebKit on macOS and Linux behave differently). What a trap guarantees is that the
  // page behind is unreachable, so that is what is asserted: focus is never on the page, however it is moved.
  test("the viewer traps focus: the page behind cannot take it", async ({ page }) => {
    await openFile(page, "code.ts");
    await expect(dialog(page).getByText(/Code or text/)).toBeVisible();
    const inDialog = () => page.evaluate(() => document.activeElement?.closest("dialog[data-component='Preview']") !== null);
    const onPage = () => page.evaluate(() => document.activeElement?.closest("main, nav, header") !== null && document.activeElement?.closest("dialog") === null);
    expect(await inDialog()).toBe(true);
    // Programmatic focus on a row, the search pill and the skip link must not move focus to the page.
    await page.evaluate(() => {
      for (const selector of ['[data-component="FileRow"]', "#coffer-search", "button"]) {
        const outside = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => element.closest("dialog") === null);
        outside?.focus();
      }
    });
    expect(await onPage()).toBe(false);
    // Tabbing around never lands on the page; it stays in the dialog (or leaves to the browser, which reads as no active element).
    for (let press = 0; press < 12; press += 1) {
      await page.keyboard.press("Tab");
      expect(await onPage()).toBe(false);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await onPage()).toBe(false);
  });
});

const ATTACKER = "attacker.invalid";

test.describe("PDF, Markdown and HTML (M5b)", () => {
  const requests: string[] = [];
  const blocked = new Set<string>();
  test.beforeEach(async ({ page }) => {
    requests.length = 0;
    blocked.clear();
    page.on("request", (request) => { requests.push(request.url()); });
    // The browser reports a request that the CSP stops, then fails it with "csp": it never reaches the network.
    page.on("requestfailed", (request) => {
      if (/csp/i.test(request.failure()?.errorText ?? "")) blocked.add(request.url());
    });
    await recordCspViolations(page);
    await enterApp(page, "/files");
    await page.evaluate(() => { window.location.hash = "#/files/preview"; });
    await expect(row(page, "sample.pdf")).toBeVisible({ timeout: 20_000 });
  });

  const nothingLeft = () => {
    expect(requests.filter((url) => url.includes(ATTACKER) && !blocked.has(url))).toEqual([]);
  };

  test("AC-53.1 a PDF renders page by page with Previous and Next page and Page N of M", async ({ page }) => {
    await openFile(page, "sample.pdf");
    const pageStatus = dialog(page).getByRole("status").filter({ hasText: /^Page / });
    await expect(pageStatus).toHaveText("Page 1 of 2", { timeout: 20_000 });
    const canvas = dialog(page).locator("canvas[data-component='PdfPage']");
    const inked = () => canvas.evaluate((element: HTMLCanvasElement) => {
      const data = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data;
      if (!data) return false;
      for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 255) < 128) return true;
      return false;
    });
    await expect.poll(inked, { timeout: 20_000 }).toBe(true);
    await expect(dialog(page).getByRole("button", { name: "Previous page" })).toBeDisabled();
    await dialog(page).getByRole("button", { name: "Next page" }).click();
    await expect(pageStatus).toHaveText("Page 2 of 2");
    await expect(dialog(page).getByRole("button", { name: "Next page" })).toBeDisabled();
    await expect.poll(inked).toBe(true);
  });

  test("AC-53.1 a PDF with an open-action script and a link runs nothing and follows nothing", async ({ page }) => {
    let dialogOpened = false;
    page.on("dialog", (alert) => {
      dialogOpened = true;
      void alert.dismiss();
    });
    await openFile(page, "scripted.pdf");
    await expect(dialog(page).getByRole("status").filter({ hasText: /^Page / })).toHaveText("Page 1 of 1", { timeout: 20_000 });
    await dialog(page).locator("canvas[data-component='PdfPage']").click();
    expect(dialogOpened).toBe(false);
    nothingLeft();
  });

  test("AC-55.1 Markdown is sanitized: no raw HTML, no remote images, safe links only", async ({ page }) => {
    await openFile(page, "hostile.md");
    const body = dialog(page).locator("[data-component='MarkdownBody']");
    await expect(body.getByRole("heading", { name: "Notes title", level: 1 })).toBeVisible();
    await expect(dialog(page).getByText("Markdown · sanitized")).toBeVisible();
    // Rendered formatting is there; everything dangerous is not an element.
    await expect(body.locator("strong")).toHaveText("bold");
    await expect(body.locator("li")).toHaveCount(2);
    expect(await body.locator("script, iframe, form, input, meta, img, [onerror], [onclick]").count()).toBe(0);
    const hrefs = await body.locator("a").evaluateAll((links) => links.map((link) => ({ href: link.getAttribute("href"), rel: link.getAttribute("rel"), target: link.getAttribute("target") })));
    for (const link of hrefs) {
      expect(link.href ?? "").toMatch(/^(https?:|mailto:)/);
      expect(link.rel).toBe("noopener noreferrer");
      expect(link.target).toBe("_blank");
    }
    expect(hrefs.map((link) => link.href)).toEqual(expect.arrayContaining(["https://example.com/page", "mailto:someone@example.com"]));
    expect(hrefs.some((link) => (link.href ?? "").startsWith("javascript:") || (link.href ?? "").startsWith("data:"))).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { __mdRan?: boolean }).__mdRan)).toBeUndefined();
    nothingLeft();
  });

  test("AC-56.1 HTML opens as source with the safety notice", async ({ page }) => {
    await openFile(page, "hostile.html");
    await expect(dialog(page).getByText("Shown as code for your safety.")).toBeVisible();
    await expect(dialog(page).getByRole("region", { name: "Preview of hostile.html" })).toContainText("<script>window.__htmlRan = true;");
    await expect(dialog(page).getByRole("button", { name: "Render in sandbox" })).toBeVisible();
    expect(await dialog(page).locator("iframe").count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __htmlRan?: boolean }).__htmlRan)).toBeUndefined();
    nothingLeft();
  });

  test("AC-56.2 Render in sandbox uses sandbox=\"\" and srcdoc, and nothing in the page executes or is requested", async ({ page }) => {
    // The hostile page is blocked by the sandbox and its own policy; each block is logged.
    expectConsole(/Blocked script execution in 'about:srcdoc'|Refused to execute the redirect|Unable to do meta refresh due to sandboxing|attacker\.invalid/);
    await openFile(page, "hostile.html");
    await dialog(page).getByRole("button", { name: "Render in sandbox" }).click();
    const frame = dialog(page).locator("iframe");
    await expect(frame).toBeVisible();
    expect(await frame.getAttribute("sandbox")).toBe("");
    // srcdoc, not a blob: URL: WebKit refuses a blob frame under the app's frame-ancestors policy (D-39).
    expect(await frame.getAttribute("srcdoc")).toContain("Hostile page heading");
    expect(await frame.getAttribute("src")).toBeNull();
    await expect(dialog(page).getByText(/Shown in a sandbox: scripts, forms, popups and remote resources are blocked/)).toBeVisible();
    // Through the iframe element, whatever URL the engine reports for a sandboxed blob document.
    const inner = await (await frame.elementHandle()).contentFrame();
    expect(inner).toBeTruthy();
    await expect(inner!.locator("#heading")).toHaveText("Hostile page heading");
    expect(await inner!.evaluate(() => (window as unknown as { __htmlRan?: boolean }).__htmlRan)).toBeUndefined();
    expect(await inner!.title()).toBe("hostile page");
    // The frame cannot reach the app: no same-origin access.
    expect(await page.evaluate(() => (window as unknown as { __htmlRan?: boolean }).__htmlRan)).toBeUndefined();
    expect(await page.title()).not.toBe("pwned");
    await expect(page).toHaveURL(/#\/files\/preview\?preview=/);
    nothingLeft();
    // Back to source.
    await dialog(page).getByRole("button", { name: "Show source" }).click();
    await expect(dialog(page).locator("iframe")).toHaveCount(0);
  });

  test("no CSP violation while previewing a PDF, Markdown and rendered HTML", async ({ page }) => {
    // The hostile page is blocked by the sandbox and its own policy; each block is logged.
    expectConsole(/Blocked script execution in 'about:srcdoc'|Refused to execute the redirect|Unable to do meta refresh due to sandboxing|attacker\.invalid/);
    await openFile(page, "sample.pdf");
    await expect(dialog(page).getByRole("status").filter({ hasText: /^Page / })).toHaveText("Page 1 of 2", { timeout: 20_000 });
    await closeViewer(page, "sample.pdf");
    await openFile(page, "hostile.md");
    await expect(dialog(page).getByText("Markdown · sanitized")).toBeVisible();
    await closeViewer(page, "hostile.md");
    await openFile(page, "hostile.html");
    await dialog(page).getByRole("button", { name: "Render in sandbox" }).click();
    await expect(dialog(page).locator("iframe")).toBeVisible();
    const violations = (await cspViolations(page)).filter((entry) => !entry.includes("blob"));
    expect(violations).toEqual([]);
  });

  test("the PDF, Markdown and HTML views pass axe", async ({ page }) => {
    for (const name of ["hostile.md", "hostile.html", "sample.pdf"]) {
      await openFile(page, name);
      if (name === "sample.pdf") await expect(dialog(page).getByRole("status").filter({ hasText: /^Page / })).toHaveText("Page 1 of 2", { timeout: 20_000 });
      else await expect(dialog(page).locator("[data-component='MarkdownBody'], [role='region']").first()).toBeVisible();
      const result = await new AxeBuilder({ page }).include("dialog[data-component='Preview']").analyze();
      expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), name).toEqual([]);
      await closeViewer(page, name);
    }
  });
});
