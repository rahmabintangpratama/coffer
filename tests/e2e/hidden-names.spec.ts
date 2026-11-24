import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createBucket, createClient } from "../integration/client";
import { admin } from "../integration/config";
import { allowOrigin } from "./fixture";
import { enterApp, goToRoute, layoutFor, type Layout } from "./helpers";

// S-10: direction and zero-width characters in object names cannot disguise the extension (security audit 0.1.0).
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const RLO = "\u202E";
const NAMES = {
  rlo: `invoice${RLO}fdp.exe`,
  lro: "photo\u202Dgpj.exe",
  rli: "doc\u2067fdp.exe\u2069",
  zwsp: "rep\u200Bort.pdf",
};
const bucketWithNames = async (): Promise<string> => {
  const bucket = await createBucket(s3, "e2e-hidden");
  await allowOrigin(s3, bucket);
  for (const name of Object.values(NAMES)) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: "x" }));
  return bucket;
};

const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"]');
const rowOf = (page: Page, key: keyof typeof NAMES) => rows(page).filter({ hasText: NAMES[key].replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").slice(0, 3) }).first();

// The button's name carries the isolated file name, so the row finds it by its prefix.
async function chooseFromMenu(page: Page, layout: Layout, key: keyof typeof NAMES, item: RegExp | string): Promise<void> {
  await rowOf(page, key).getByRole("button", { name: /^More actions for/ }).click();
  if (layout === "compact") await page.getByRole("dialog").getByRole("button", { name: item }).click();
  else await page.getByRole("menuitem", { name: item }).click();
}

/** The extension is drawn after the stem, left to right: no control in the stem moved it. */
async function expectExtensionLast(row: ReturnType<typeof rowOf>): Promise<void> {
  const parts = row.locator("bdi");
  await expect(parts).toHaveCount(2);
  const [stem, tail] = await Promise.all([parts.nth(0).boundingBox(), parts.nth(1).boundingBox()]);
  expect(stem && tail && tail.x >= stem.x + stem.width - 1).toBe(true);
}

test("S-10 the list isolates every name: the extension stays last for RLO, LRO, RLI and zero-width names", async ({ page }) => {
  const bucket = await bucketWithNames();
  await enterApp(page, "/files", { bucket });
  for (const key of ["rlo", "lro", "rli", "zwsp"] as const) {
    const row = rowOf(page, key);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expectExtensionLast(row);
  }
});

test("S-10 Details draws the characters as code points and warns", async ({ page }, testInfo) => {
  const bucket = await bucketWithNames();
  await enterApp(page, "/files", { bucket });
  await expect(rowOf(page, "rlo")).toBeVisible({ timeout: 15_000 });
  await chooseFromMenu(page, layoutFor(testInfo), "rlo", "Details");
  const panel = page.locator('[data-component="DetailsPanel"]');
  await expect(panel.getByText("This name has hidden characters")).toBeVisible();
  const text = (await panel.innerText()).replace(/\s+/g, " ");
  expect(text).toContain("invoice⟨U+202E⟩fdp.exe");
  expect(text).not.toContain(RLO);
  // The reading order is the stored order: the extension comes last.
  expect(text.indexOf("fdp.exe")).toBeGreaterThan(text.indexOf("invoice"));
});

test("S-10 Rename shows the warning and the stored order", async ({ page }, testInfo) => {
  const bucket = await bucketWithNames();
  await enterApp(page, "/files", { bucket });
  await expect(rowOf(page, "zwsp")).toBeVisible({ timeout: 15_000 });
  await chooseFromMenu(page, layoutFor(testInfo), "zwsp", "Rename");
  const dialog = page.getByRole("dialog", { name: "Rename" });
  await expect(dialog.getByText("This name has hidden characters")).toBeVisible();
  await expect(dialog.getByTestId("hidden-names")).toHaveText("rep⟨U+200B⟩ort.pdf");
});

test("S-10 Delete forever names the real order and warns", async ({ page }, testInfo) => {
  const bucket = await bucketWithNames();
  await enterApp(page, "/files", { bucket });
  await expect(rowOf(page, "rlo")).toBeVisible({ timeout: 15_000 });
  await chooseFromMenu(page, layoutFor(testInfo), "rlo", /^Move to trash/);
  await expect(rows(page).filter({ hasText: "invoice" })).toHaveCount(0, { timeout: 15_000 });
  await goToRoute(page, "/trash");
  const row = page.locator('[data-component="TrashRow"]').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Delete forever" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete forever?" });
  await expect(dialog.getByText("This name has hidden characters")).toBeVisible();
  await expect(dialog.getByTestId("hidden-names")).toHaveText("invoice⟨U+202E⟩fdp.exe");
});
