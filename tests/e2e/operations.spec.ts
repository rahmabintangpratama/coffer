import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { putMany } from "../integration/seed";
import { E2E_BUCKET } from "./fixture";
import { axeViolations, enterApp, layoutFor, type Layout } from "./helpers";

// M6a: Rename, Make a copy, Move, the journal and the interrupted banner (FR-32, FR-33, FR-34, FR-45).
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const unique = () => `e2e-ops/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();

async function keysUnder(prefix: string): Promise<string[]> {
  const all: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: E2E_BUCKET, Prefix: prefix, ...(token === undefined ? {} : { ContinuationToken: token }) }));
    all.push(...(page.Contents ?? []).map((object) => object.Key ?? ""));
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return all.sort();
}

async function put(key: string, body: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: key, Body: body }));
}
const read = async (key: string) => (await (await s3.send(new GetObjectCommand({ Bucket: E2E_BUCKET, Key: key }))).Body?.transformToString()) ?? "";

async function openFolder(page: Page, folder: string): Promise<void> {
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/files/${folder}`);
}

async function chooseFromMenu(page: Page, layout: Layout, rowName: string, item: RegExp | string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${rowName}` }).first().click();
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: item }).click();
  else await page.getByRole("menuitem", { name: item }).click();
}

const toast = (page: Page) => page.locator('[data-component="Toast"]');

test.describe("rename, copy and move", () => {
  let folder = "";
  test.beforeEach(async ({ page }) => {
    folder = unique();
    await put(`${folder}/a.txt`, "alpha");
    await put(`${folder}/b.txt`, "beta");
    await enterApp(page, "/files");
    await openFolder(page, folder);
    await expect(row(page, "a.txt")).toBeVisible({ timeout: 15_000 });
  });

  test("AC-32.1 and AC-32.5 renames a file, and Undo puts the name back", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    await chooseFromMenu(page, layout, "a.txt", "Rename");
    const dialog = page.getByRole("dialog", { name: "Rename" });
    await dialog.getByLabel("Name").fill("renamed.txt");
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(toast(page)).toContainText("Renamed to renamed.txt", { timeout: 20_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/b.txt`, `${folder}/renamed.txt`]);
    expect(await read(`${folder}/renamed.txt`)).toBe("alpha");
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => keysUnder(`${folder}/`), { timeout: 20_000 }).toEqual([`${folder}/a.txt`, `${folder}/b.txt`]);
  });

  test("AC-32.2 a name with a slash is refused and nothing starts", async ({ page }, testInfo) => {
    await chooseFromMenu(page, layoutFor(testInfo), "a.txt", "Rename");
    const dialog = page.getByRole("dialog", { name: "Rename" });
    await dialog.getByLabel("Name").fill("x/y.txt");
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(dialog.getByText("Names can’t contain slashes. Use Move to change folders.")).toBeVisible();
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/a.txt`, `${folder}/b.txt`]);
  });

  test("AC-32.3 renaming onto an existing name asks, and Keep both numbers the new one", async ({ page }, testInfo) => {
    await chooseFromMenu(page, layoutFor(testInfo), "a.txt", "Rename");
    const dialog = page.getByRole("dialog", { name: "Rename" });
    await dialog.getByLabel("Name").fill("b.txt");
    await dialog.getByRole("button", { name: "Rename" }).click();
    const conflict = page.getByRole("dialog", { name: "This file already exists" });
    await expect(conflict).toBeVisible();
    await conflict.getByRole("radio", { name: /Keep both/ }).check();
    await conflict.getByRole("button", { name: "Continue" }).click();
    await expect.poll(() => keysUnder(`${folder}/`), { timeout: 20_000 }).toEqual([`${folder}/b (1).txt`, `${folder}/b.txt`]);
    expect(await read(`${folder}/b.txt`)).toBe("beta");
    expect(await read(`${folder}/b (1).txt`)).toBe("alpha");
  });

  test("AC-33.1 and AC-33.2 Make a copy proposes name (copy).ext and keeps the original", async ({ page }, testInfo) => {
    await chooseFromMenu(page, layoutFor(testInfo), "a.txt", "Make a copy");
    const dialog = page.getByRole("dialog", { name: "Make a copy" });
    await expect(dialog.getByLabel("Name for the copy")).toHaveValue("a (copy).txt");
    await expect(dialog.getByText(/The copy is saved in/)).toBeVisible();
    await dialog.getByRole("button", { name: "Make a copy" }).click();
    await expect(toast(page)).toContainText("Copy saved as a (copy).txt", { timeout: 20_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/a (copy).txt`, `${folder}/a.txt`, `${folder}/b.txt`]);
    expect(await read(`${folder}/a (copy).txt`)).toBe("alpha");
    // A copy has no Undo (technical-spec 8).
    await expect(toast(page).getByRole("button", { name: "Undo" })).toHaveCount(0);
  });

  test("AC-33.3 a taken proposal increments to (copy 2)", async ({ page }, testInfo) => {
    await put(`${folder}/a (copy).txt`, "older copy");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(row(page, "a (copy).txt")).toBeVisible({ timeout: 15_000 });
    await chooseFromMenu(page, layoutFor(testInfo), "a.txt", "Make a copy");
    await expect(page.getByRole("dialog", { name: "Make a copy" }).getByLabel("Name for the copy")).toHaveValue("a (copy 2).txt");
  });

  test("AC-34.1 and AC-34.2 Move opens the folder tree, and Move here moves the file; Undo moves it back", async ({ page }, testInfo) => {
    await put(`${folder}/target/keep.txt`, "k");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(row(page, "target")).toBeVisible({ timeout: 15_000 });
    await chooseFromMenu(page, layoutFor(testInfo), "a.txt", /^Move…/);
    const dialog = page.getByRole("dialog", { name: "Move 1 item" });
    await expect(dialog.getByRole("tree", { name: "Folders" })).toBeVisible();
    await expect(dialog.getByText("Current location")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Move here" })).toBeDisabled();
    // The tree opens along the way to where the file is; choose a folder there with the keyboard.
    const tree = dialog.getByRole("tree");
    const target = tree.getByRole("treeitem", { name: /^target/ });
    await target.focus();
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Move here" }).click();
    await expect(toast(page)).toContainText("Moved a.txt", { timeout: 20_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/b.txt`, `${folder}/target/a.txt`, `${folder}/target/keep.txt`]);
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => keysUnder(`${folder}/`), { timeout: 20_000 }).toEqual([`${folder}/a.txt`, `${folder}/b.txt`, `${folder}/target/keep.txt`]);
  });

  test("the Move dialog passes axe", async ({ page, browserName }, testInfo) => {
    test.skip(browserName === "firefox", "axe crashes Firefox's content process on this dialog in CI (tracked in open-questions.md, D-50); Chromium and WebKit run it.");
    await chooseFromMenu(page, layoutFor(testInfo), "a.txt", /^Move…/);
    const dialog = page.getByRole("dialog", { name: "Move 1 item" });
    await expect(dialog.getByRole("treeitem", { name: /Current location/ })).toBeVisible();
    // Contrast is measured on final colours, after the dialog's open animation (as in the other axe checks).
    const violations = await axeViolations(page);
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});

test.describe("folders and the journal", () => {
  test("AC-32.4 renames a folder: every object under it moves, nested ones too", async ({ page }, testInfo) => {
    const folder = unique();
    await putMany(s3, E2E_BUCKET, [`${folder}/old/`, `${folder}/old/a.txt`, `${folder}/old/sub/b.txt`, `${folder}/old/sub/deeper/c.txt`]);
    await enterApp(page, "/files");
    await openFolder(page, folder);
    await expect(row(page, "old")).toBeVisible({ timeout: 15_000 });
    await chooseFromMenu(page, layoutFor(testInfo), "old", "Rename");
    const dialog = page.getByRole("dialog", { name: "Rename" });
    await dialog.getByLabel("Name").fill("fresh");
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(toast(page)).toContainText("Renamed to fresh", { timeout: 30_000 });
    expect(await keysUnder(`${folder}/`)).toEqual([`${folder}/fresh/`, `${folder}/fresh/a.txt`, `${folder}/fresh/sub/b.txt`, `${folder}/fresh/sub/deeper/c.txt`]);
  });

  test("AC-34.2 a folder move runs in the background with progress in the panel and does not block the page", async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "The long-task API is Chromium only.");
    const folder = unique();
    const count = 400;
    await putMany(s3, E2E_BUCKET, Array.from({ length: count }, (_, n) => `${folder}/src/f-${n.toString().padStart(4, "0")}.txt`));
    await enterApp(page, "/files");
    await openFolder(page, folder);
    await expect(row(page, "src")).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      const store = window as unknown as { __long: number[] };
      store.__long = [];
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) store.__long.push(entry.duration); }).observe({ entryTypes: ["longtask"] });
    });
    await put(`${folder}/dst/keep.txt`, "k");
    await chooseFromMenu(page, layoutFor(testInfo), "src", /^Move…/);
    const dialog = page.getByRole("dialog", { name: "Move 1 item" });
    await dialog.getByRole("tree").getByRole("treeitem", { name: /^dst/ }).focus();
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Move here" }).click();
    const bar = page.getByRole("progressbar", { name: "Moving “src”" });
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await expect(bar).toHaveAttribute("aria-valuetext", /of 400 objects/);
    await expect(toast(page)).toContainText("Moved src", { timeout: 120_000 });
    expect((await keysUnder(`${folder}/dst/src/`)).length).toBe(count);
    const longest = await page.evaluate(() => Math.max(0, ...(window as unknown as { __long: number[] }).__long));
    // No task blocked the main thread for long enough to notice (the browser calls anything over 50 ms a long task).
    expect(longest).toBeLessThan(250);
  });
});

/** Move the folder `src` of the open folder into `dst`, through the Move dialog. */
async function moveSrcIntoDst(page: Page): Promise<void> {
  await page.getByRole("button", { name: "More actions for src" }).first().click();
  const layout = layoutFor(test.info());
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: /^Move…/ }).click();
  else await page.getByRole("menuitem", { name: /^Move…/ }).click();
  const dialog = page.getByRole("dialog", { name: "Move 1 item" });
  await dialog.getByRole("tree").getByRole("treeitem", { name: /^dst/ }).focus();
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Move here" }).click();
}

/** Wait until the journal in IndexedDB says more than `count` objects are done: the move is under way. */
async function journalDoneReaches(page: Page, count: number, timeout: number): Promise<void> {
  // Wait until a good part is done, as the journal in IndexedDB says, then close the tab's work by reloading.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open("coffer");
              open.onerror = () => { reject(new Error("open")); };
              open.onsuccess = () => {
                const all = open.result.transaction("journal").objectStore("journal").getAll();
                all.onsuccess = () => { resolve(Math.max(0, ...(all.result as { done: number }[]).map((entry) => entry.done))); };
              };
            }),
        ),
      { timeout },
    )
    .toBeGreaterThan(count);
}

test("exit check: a 2,000-object folder move cut off by a reload resumes from the banner with nothing lost or duplicated", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "One engine is enough for the long exit check; the engine itself is covered in integration.");
  test.setTimeout(240_000);
  const folder = unique();
  const original = Array.from({ length: 2000 }, (_, n) => `${folder}/src/f-${n.toString().padStart(5, "0")}.txt`);
  await putMany(s3, E2E_BUCKET, original, 48);
  await page.route(/./, async (route) => {
    // Slow every copy a little so the page can be closed while the move is under way.
    if (route.request().headers()["x-amz-copy-source"] !== undefined) await new Promise((resolve) => setTimeout(resolve, 30));
    await route.continue().catch(() => undefined);
  });
  await enterApp(page, "/files");
  await openFolder(page, folder);
  await expect(row(page, "src")).toBeVisible({ timeout: 15_000 });
  await put(`${folder}/dst/keep.txt`, "k");
  // The new folder is not in the list that is already showing.
  await openFolder(page, `${folder}/`);
  await expect(row(page, "src")).toBeVisible({ timeout: 15_000 });
  await moveSrcIntoDst(page);
  await journalDoneReaches(page, 150, 90_000);
  await page.unroute(/./);
  await page.reload();
  await enterApp(page, "/files");
  await openFolder(page, folder);
  const banner = page.locator('[data-component="InterruptedBanner"]');
  await expect(banner.getByText("A move was interrupted")).toBeVisible({ timeout: 30_000 });
  await expect(banner.getByText(/of 2000 objects in src were moved before the page closed/)).toBeVisible();
  const partway = (await keysUnder(`${folder}/dst/src/`)).length;
  expect(partway).toBeGreaterThan(0);
  expect(partway).toBeLessThan(2000);
  await banner.getByRole("button", { name: "Resume" }).click();
  await expect(banner).toHaveCount(0, { timeout: 30_000 });
  await expect(toast(page)).toContainText("Moved src", { timeout: 180_000 });
  // The diff: nothing left at the source, every object at the destination exactly once, none invented.
  expect(await keysUnder(`${folder}/src/`)).toEqual([]);
  expect(await keysUnder(`${folder}/dst/src/`)).toEqual(original.map((key) => key.replace("/src/", "/dst/src/")));
});

test("D-41 Resume clicked in two tabs runs the operation once, and the result has no duplicates", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Web Locks across tabs are the same in every engine; one is enough for the race.");
  test.setTimeout(180_000);
  const folder = unique();
  const original = Array.from({ length: 400 }, (_, n) => `${folder}/src/f-${n.toString().padStart(4, "0")}.txt`);
  await putMany(s3, E2E_BUCKET, original, 48);
  await page.route(/./, async (route) => {
    if (route.request().headers()["x-amz-copy-source"] !== undefined) await new Promise((resolve) => setTimeout(resolve, 30));
    await route.continue().catch(() => undefined);
  });
  await enterApp(page, "/files");
  await openFolder(page, folder);
  await expect(row(page, "src")).toBeVisible({ timeout: 15_000 });
  await put(`${folder}/dst/keep.txt`, "k");
  await openFolder(page, `${folder}/`);
  await expect(row(page, "src")).toBeVisible({ timeout: 15_000 });
  await moveSrcIntoDst(page);
  await journalDoneReaches(page, 40, 60_000);
  await page.unroute(/./);
  await page.reload();

  // Two tabs with their own memory-only sessions: both load the same interrupted entry.
  const other = await context.newPage();
  const tabs = [page, other];
  const copies = new Map<string, number>();
  for (const tab of tabs) {
    tab.on("request", (request) => {
      const source = request.headers()["x-amz-copy-source"];
      if (source !== undefined) copies.set(source, (copies.get(source) ?? 0) + 1);
    });
  }
  for (const tab of tabs) {
    await enterApp(tab, "/files");
    await openFolder(tab, folder);
    await expect(tab.locator('[data-component="InterruptedBanner"]').getByText("A move was interrupted")).toBeVisible({ timeout: 30_000 });
  }
  // A toast leaves after a few seconds, and under load the move can take longer than that. Record every toast as it appears
  // instead of reading what is left at the end (the loser's notice was gone by then on a busy machine).
  for (const tab of tabs) {
    await tab.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __toasts: string[] }).__toasts = seen;
      new MutationObserver(() => {
        for (const node of document.querySelectorAll('[data-component="Toast"]')) {
          const text = node.textContent;
          if (text && !seen.includes(text)) seen.push(text);
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }
  await Promise.all(tabs.map((tab) => tab.locator('[data-component="InterruptedBanner"]').getByRole("button", { name: "Resume" }).click()));
  await expect.poll(async () => (await keysUnder(`${folder}/src/`)).length, { timeout: 120_000 }).toBe(0);

  // Exactly one tab ran it; the other said so and copied nothing.
  const messages = await Promise.all(tabs.map((tab) => tab.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts)));
  expect(messages.flat().filter((text) => text.includes("Moved src"))).toHaveLength(1);
  expect(messages.flat().some((text) => /running in another tab|already finished or was discarded/.test(text))).toBe(true);
  expect([...copies.values()].every((count) => count === 1)).toBe(true);
  expect(await keysUnder(`${folder}/dst/src/`)).toEqual(original.map((key) => key.replace("/src/", "/dst/src/")));
});
