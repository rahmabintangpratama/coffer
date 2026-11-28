import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { enterApp, goToRoute } from "./helpers";

// M11, design screens.md: from 1024 px New sits at the top of the sidebar, Files has an ⓘ toggle for Details,
// and the connection switcher offers Lock once a connection is saved.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });
const PASS = "correct horse battery staple";
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"]');

test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "the sidebar exists from 1024 px");
});

test("M11 New is at the top of the sidebar on Files, and ⓘ toggles Details for the selected file", async ({ page }) => {
  const folder = `e2e-shell/${Date.now().toString(36)}`;
  await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/a.txt`, Body: "x" }));
  await enterApp(page, "/files");
  await goToRoute(page, `/files/${folder}`);
  await expect(rows(page).filter({ hasText: "a.txt" })).toBeVisible({ timeout: 15_000 });
  const sidebar = page.locator('[data-component="Sidebar"]');
  await expect(sidebar.getByRole("button", { name: "New", exact: true })).toBeVisible();
  // It is above the destinations.
  const newBox = await sidebar.getByRole("button", { name: "New", exact: true }).boundingBox();
  const homeBox = await sidebar.getByRole("link", { name: "Home" }).boundingBox();
  expect(newBox && homeBox ? newBox.y < homeBox.y : false).toBe(true);
  // Collapsed, it is an icon with the same name.
  await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar.getByRole("button", { name: "New", exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "Expand sidebar" }).click();

  const info = page.getByRole("button", { name: "Details", exact: true });
  await expect(info).toBeDisabled();
  await rows(page).filter({ hasText: "a.txt" }).click();
  await expect(info).toBeEnabled();
  await info.click();
  await expect(info).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("complementary", { name: "Details" })).toBeVisible();
  await info.click();
  await expect(page.getByRole("complementary", { name: "Details" })).toHaveCount(0);

  // Elsewhere the slot is empty.
  await goToRoute(page, "/trash");
  await expect(sidebar.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
});

test("M11 the switcher offers Lock for a saved connection", async ({ page }) => {
  await enterApp(page, "/files", { passphrase: PASS });
  await page.locator('[data-component="Sidebar"]').getByRole("button", { name: /^Switch connection:/ }).click();
  await expect(page.getByRole("button", { name: "Lock", exact: true }).or(page.getByRole("menuitem", { name: "Lock" })).first()).toBeVisible();
});

test("M11 the Type menu opens at its chip, inside the content, and an active chip has an × that clears it", async ({ page }) => {
  await enterApp(page, "/files");
  await page.evaluate(() => { window.location.hash = "#/files/preview"; });
  await expect(rows(page).filter({ hasText: "sample.png" })).toBeVisible({ timeout: 20_000 });
  const chip = page.getByRole("button", { name: "Type", exact: true });
  await chip.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const chipBox = await chip.boundingBox();
  const menuBox = await menu.boundingBox();
  const sidebarBox = await page.locator('[data-component="Sidebar"]').boundingBox();
  expect(chipBox && menuBox ? Math.abs(menuBox.x - chipBox.x) < 2 : false).toBe(true);
  expect(menuBox && sidebarBox ? menuBox.x >= sidebarBox.x + sidebarBox.width : false).toBe(true);
  await menu.getByRole("menuitemradio").or(menu.getByRole("menuitem")).filter({ hasText: /^Images?$/ }).first().click();
  const active = page.getByRole("button", { name: /^Type: / });
  await expect(active).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear Type filter" }).click();
  await expect(page.getByRole("button", { name: "Type", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Clear Type filter" })).toHaveCount(0);
});
