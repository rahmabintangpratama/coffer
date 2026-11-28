import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Page } from "@playwright/test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { expect, test } from "./test";
import { enterApp, goToRoute } from "./helpers";
import { scratchPrefix } from "./scratch";

// Password managers watch the browser's top layer: Bitwarden turns its inline menu off on a page that keeps adding
// dialogs or promoting elements. A dialog is in the document only while open, and is promoted once per open.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const PASS = "correct horse battery staple";

interface TopLayer {
  /** Every dialog or popover element that entered the document. */
  inserted: number;
  /** Every call that puts an element on the top layer. */
  promotions: number;
  /** Elements promoted again while still open. */
  repeated: string[];
}

async function watchTopLayer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state: TopLayer = { inserted: 0, promotions: 0, repeated: [] };
    (window as unknown as { __topLayer: TopLayer }).__topLayer = state;
    const open = new WeakSet<Element>();
    const label = (element: Element) => element.getAttribute("data-component") ?? element.tagName;
    const wrap = (target: object, method: string, promotes: boolean) => {
      const original = (target as Record<string, ((...args: unknown[]) => unknown) | undefined>)[method];
      if (!original) return;
      (target as Record<string, unknown>)[method] = function (this: Element, ...args: unknown[]) {
        if (promotes) {
          state.promotions += 1;
          if (open.has(this)) state.repeated.push(`${method} ${label(this)}`);
          open.add(this);
        } else open.delete(this);
        return original.apply(this, args);
      };
    };
    wrap(HTMLDialogElement.prototype, "showModal", true);
    wrap(HTMLDialogElement.prototype, "show", true);
    wrap(HTMLDialogElement.prototype, "close", false);
    wrap(HTMLElement.prototype, "showPopover", true);
    wrap(HTMLElement.prototype, "hidePopover", false);
    wrap(HTMLElement.prototype, "togglePopover", true);
    wrap(Element.prototype, "requestFullscreen", true);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) state.inserted += (node.matches("dialog, [popover]") ? 1 : 0) + node.querySelectorAll("dialog, [popover]").length;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

const topLayer = (page: Page) => page.evaluate(() => (window as unknown as { __topLayer: TopLayer }).__topLayer);
const closedDialogs = (page: Page) => page.locator("dialog:not([open])").count();

test("a dialog is in the page only while open and is promoted once per open, from Unlock through toasts", async ({ page }) => {
  const folder = scratchPrefix("e2e-top");
  for (const name of ["a.txt", "b.txt", "c.txt"]) await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: `${folder}/${name}`, Body: "x" }));
  await enterApp(page, "/files", { passphrase: PASS });
  await watchTopLayer(page);
  await page.reload();

  // Unlock: the screen, and the app that mounts behind it, add nothing to the top layer.
  await page.getByLabel("Passphrase").fill(PASS);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
  await goToRoute(page, `/files/${folder}`);
  const rows = page.locator('[data-component="FileRow"], [data-component="FileTile"]');
  await expect(rows.filter({ hasText: "a.txt" }).first()).toBeVisible({ timeout: 15_000 });
  expect(await closedDialogs(page)).toBe(0);
  expect(await topLayer(page)).toEqual({ inserted: 0, promotions: 0, repeated: [] });

  // Open and close a dialog twice: one element and one promotion each time, and nothing left behind.
  for (const times of [1, 2]) {
    await rows.filter({ hasText: "a.txt" }).first().focus();
    await page.keyboard.press("F2").catch(() => undefined);
    const rename = page.getByRole("dialog", { name: "Rename" });
    if ((page.viewportSize()?.width ?? 0) < 768) {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "More actions for a.txt" }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
    }
    await expect(rename).toBeVisible();
    // Typing renders the dialog again and again; it stays where it is.
    await rename.getByLabel("Name").pressSequentially("-new");
    const open = await topLayer(page);
    expect(open.repeated).toEqual([]);
    expect(open.inserted).toBe(open.promotions);
    await page.keyboard.press("Escape");
    await expect(rename).toHaveCount(0);
    // Gone from the page, not only hidden: the browser closes it first and the app removes it on the close event.
    await expect(page.locator("dialog"), `after ${String(times)}`).toHaveCount(0);
  }
  const before = await topLayer(page);

  // Several toasts: none of them uses the top layer.
  for (const name of ["a.txt", "b.txt", "c.txt"]) {
    await page.getByRole("button", { name: `More actions for ${name}` }).first().click();
    if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole("dialog").getByRole("button", { name: "Add to starred" }).click();
    else await page.getByRole("menuitem", { name: "Add to starred" }).click();
  }
  await expect(page.locator('[data-component="Toast"]')).toHaveCount(3);
  const after = await topLayer(page);
  expect(after.repeated).toEqual([]);
  // Below 768 px each menu is a sheet, which is one dialog per open; from 768 px menus and toasts use none.
  const sheets = (page.viewportSize()?.width ?? 0) < 768 ? 3 : 0;
  expect([after.promotions - before.promotions, after.inserted - before.inserted]).toEqual([sheets, sheets]);
  await expect.poll(() => closedDialogs(page)).toBe(0);
});
