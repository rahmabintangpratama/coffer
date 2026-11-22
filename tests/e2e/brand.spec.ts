import { expect, test } from "./test";
import { collectErrors, enterApp } from "./helpers";

// OQ-33 / C-53: every icon the page or the manifest points to must be served
// under the real _headers, with the right type and a long cache.
const types: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/vnd.microsoft.icon",
};

test.describe("Brand assets", () => {
  test("every linked icon returns 200 with the right content type and a long cache", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page
      .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    expect(hrefs).toEqual(["/favicon.svg", "/icons/favicon-32x32.png", "/icons/favicon.ico", "/icons/apple-touch-icon.png"]);
    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), href).toBe(200);
      const extension = href.split(".").pop() ?? "";
      expect(response.headers()["content-type"], href).toContain(types[extension]);
      expect(response.headers()["cache-control"], href).toBe("public, max-age=31536000, immutable");
      expect((await response.body()).byteLength, href).toBeGreaterThan(100);
    }
  });

  test("the manifest parses and every icon in it resolves", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    const response = await page.request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");
    const manifest = (await response.json()) as {
      start_url: string;
      scope: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.icons.map((icon) => icon.purpose)).toEqual(["any", "any", "maskable"]);
    for (const icon of manifest.icons) {
      const url = new URL(icon.src, new URL(href ?? "", page.url()));
      const asset = await page.request.get(url.href);
      expect(asset.status(), icon.src).toBe(200);
      expect(asset.headers()["content-type"], icon.src).toContain(icon.type);
      expect(asset.headers()["cache-control"], icon.src).toContain("immutable");
    }
  });

  test("two theme-color metas follow the color scheme and match the app bar surface", async ({ page }) => {
    await page.goto("/");
    const metas = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("media"), node.getAttribute("content")]));
    expect(metas).toEqual([
      ["(prefers-color-scheme: light)", "#FFFFFF"],
      ["(prefers-color-scheme: dark)", "#22211E"],
    ]);
  });

  test("the app mark shows beside the name in both themes without a CSP violation", async ({ page }) => {
    const violations = collectErrors(page);
    await enterApp(page, "/settings/appearance");
    const mark = page.locator('[data-component="AppBar"] [data-component="CofferMark"]');
    await expect(mark).toBeVisible();
    await page.getByRole("radio", { name: "Dark" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(mark).toBeVisible();
    expect(violations).toEqual([]);
  });
});
