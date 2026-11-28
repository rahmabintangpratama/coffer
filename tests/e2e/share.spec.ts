import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { axeViolations, enterApp, layoutFor, type Layout } from "./helpers";
import { scratchPrefix } from "./scratch";

// M7: Share link (FR-60, FR-61). The fixture serves the link to a plain fetch, so "open it in a private window"
// is a request with no cookies and no keys.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const unique = () => scratchPrefix("e2e-share");
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
// M11: the dialog is named after the file it shares.
const dialog = (page: Page) => page.getByRole("dialog", { name: /^Share “.+”$/ });
const serious = (violations: Awaited<ReturnType<typeof axeViolations>>) => violations.filter((v) => v.impact === "serious" || v.impact === "critical");
const choice = (page: Page, name: string) => dialog(page).getByRole("radio", { name });

async function put(key: string, body: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: key, Body: body }));
}

async function openShareFromMenu(page: Page, layout: Layout, rowName: string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${rowName}` }).first().click();
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: "Share link" }).click();
  else await page.getByRole("menuitem", { name: "Share link" }).click();
  await expect(dialog(page)).toBeVisible();
}

async function enterFolder(page: Page, folder: string): Promise<void> {
  await enterApp(page, `/files/${folder}`);
  await expect(row(page, "report.txt")).toBeVisible({ timeout: 15_000 });
}

test.describe("share link", () => {
  let folder = "";
  test.beforeEach(async () => {
    folder = unique();
    await put(`${folder}/report.txt`, "quarterly numbers");
  });

  test("AC-60.1, AC-60.2, AC-60.3 and AC-60.5 the dialog preselects 1 day, creates a link that downloads, and keeps it out of logs, storage and the address", async ({ page, context, browserName }, testInfo) => {
    const layout = layoutFor(testInfo);
    const logged: string[] = [];
    page.on("console", (message) => { logged.push(message.text()); });
    const requested: string[] = [];
    page.on("request", (request) => { requested.push(request.url()); });
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await enterFolder(page, folder);
    await openShareFromMenu(page, layout, "report.txt");

    await expect(dialog(page).getByText("Anyone with the link can open this file until it expires. Links can’t be revoked early.")).toBeVisible();
    for (const label of ["15 minutes", "30 minutes", "1 hour", "1 day", "7 days"]) await expect(choice(page, label)).toBeVisible();
    await expect(choice(page, "1 day")).toBeChecked();
    for (const label of ["15 minutes", "30 minutes", "1 hour", "1 day", "7 days"]) await expect(choice(page, label)).not.toHaveAttribute("aria-disabled", "true");
    expect(serious(await axeViolations(page))).toEqual([]);

    await choice(page, "1 hour").check();
    await dialog(page).getByRole("button", { name: "Create link for 1 hour" }).click();
    const link = dialog(page).getByRole("textbox", { name: "Link" });
    await expect(link).toBeVisible();
    const url = await link.inputValue();
    expect(url).toContain(`/${E2E_BUCKET}/${folder}/report.txt`);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("3600");
    await expect(dialog(page).getByText(/^Expires /)).toBeVisible();
    await expect(dialog(page).getByText("To cancel all links early, rotate the access key at your provider.")).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);

    // Anyone with the link can download it, with no keys and no cookies.
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("quarterly numbers");

    if (browserName === "chromium") {
      await dialog(page).getByRole("button", { name: "Copy link" }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    }

    // AC-60.5: the link is in the dialog and nowhere else.
    const signature = new URL(url).searchParams.get("X-Amz-Signature") ?? "missing";
    expect(page.url()).not.toContain(signature);
    expect(logged.join("\n")).not.toContain(signature);
    expect(requested.filter((entry) => entry.includes(signature) && entry !== url)).toEqual([]);
    expect(requested.some((entry) => !entry.startsWith("http://127.0.0.1:"))).toBe(false);
    const stored = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const dump = [JSON.stringify(Object.entries(localStorage)), JSON.stringify(Object.entries(sessionStorage))];
          const open = indexedDB.open("coffer");
          open.onerror = () => { resolve(dump.join("|")); };
          open.onsuccess = () => {
            const database = open.result;
            const names = [...database.objectStoreNames];
            if (names.length === 0) { resolve(dump.join("|")); return; }
            const transaction = database.transaction(names, "readonly");
            let pending = names.length;
            for (const name of names) {
              const all = transaction.objectStore(name).getAll();
              all.onsuccess = () => {
                dump.push(JSON.stringify(all.result));
                pending -= 1;
                if (pending === 0) resolve(dump.join("|"));
              };
            }
          };
        }),
    );
    expect(stored).not.toContain(signature);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(dialog(page)).toHaveCount(0);
    // Reopening starts from the choice step again: the link is not kept.
    await openShareFromMenu(page, layout, "report.txt");
    await expect(dialog(page).getByRole("textbox", { name: "Link" })).toHaveCount(0);
    await expect(choice(page, "1 day")).toBeChecked();
  });

  test("AC-60.4 a folder's menu shows Share link disabled with the reason, and the selection bar needs exactly one file", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    await put(`${folder}/sub/inner.txt`, "i");
    await put(`${folder}/other.txt`, "o");
    await enterFolder(page, folder);
    await expect(row(page, "sub")).toBeVisible();
    await page.getByRole("button", { name: "More actions for sub" }).first().click();
    const item = layout === "compact" ? page.getByRole("dialog").getByRole("button", { name: /^Share link/ }) : page.getByRole("menuitem", { name: /^Share link/ });
    await expect(item).toBeVisible();
    if (layout === "compact") await expect(item).toBeDisabled();
    else await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Only a single file can be shared.")).toBeVisible();
    await page.keyboard.press("Escape");

    // One file selected: the bar offers Share link. Two: it is disabled. (Touch selection is a long press, covered by the unit tests.)
    if (layout === "compact") return;
    await row(page, "report.txt").click();
    const bar = page.getByRole("toolbar", { name: "Selection actions" });
    await expect(bar.getByRole("button", { name: "Share link" })).toBeEnabled();
    await row(page, "other.txt").click({ modifiers: ["ControlOrMeta"] });
    await expect(bar.getByRole("button", { name: "Share link" })).toBeDisabled();
  });

  test("FR-60 the viewer has a Share link button", async ({ page }) => {
    await enterFolder(page, folder);
    await row(page, "report.txt").focus();
    await page.keyboard.press("Enter");
    const viewer = page.locator('dialog[data-component="Preview"]');
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Share link" }).click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Create link for 1 day" }).click();
    await expect(dialog(page).getByRole("textbox", { name: "Link" })).toBeVisible();
  });
});
