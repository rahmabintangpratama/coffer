import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type Locator, type Page } from "@playwright/test";
import { createClient } from "../integration/client";
import { admin } from "../integration/config";
import { E2E_BUCKET } from "./fixture";
import { enterApp, layoutFor } from "./helpers";
import { expect, test } from "./test";

// M10: every MVP flow that has a keyboard path, driven by the keyboard alone. The page is set up with the pointer (connecting
// is covered by its own keyboard test in onboarding.spec.ts); from the first line of each test on, only keys are pressed:
// Tab, Shift+Tab, the arrows, Home, End, Enter, Space, Escape, `/` and typing. The design's rule is that every action has a
// keyboard path and that dialogs trap focus, close with Esc and give focus back to what opened them (accessibility.md).
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const PASS = "correct horse battery staple";
const unique = () => `e2e-kbd/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const rows = (page: Page) => page.locator('[data-component="FileRow"], [data-component="FileTile"], [data-component="FolderTile"]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
const isFocused = (locator: Locator) => locator.evaluate((element) => element === document.activeElement).catch(() => false);

async function put(key: string, body = "x"): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: E2E_BUCKET, Key: key, Body: body }));
}

/**
 * The key that moves to the next control. WebKit on macOS (Safari's own behaviour) leaves buttons out of the plain Tab order
 * unless "Press Tab to highlight each item" is on; Option+Tab is the same walk with buttons. On Linux, where CI runs, and in
 * the other engines, Tab already visits them.
 */
const tabKey = (page: Page, backwards = false): string => {
  const alt = process.platform === "darwin" && page.context().browser()?.browserType().name() === "webkit";
  return `${alt ? "Alt+" : ""}${backwards ? "Shift+" : ""}Tab`;
};

/** Press Tab until the element has focus. Fails if it is not reached, which is a keyboard path that does not exist. */
async function tabTo(page: Page, target: Locator, steps = 120): Promise<void> {
  for (let step = 0; step < steps; step += 1) {
    if (await isFocused(target)) return;
    await page.keyboard.press(tabKey(page));
  }
  throw new Error(`Tab never reached ${target.toString()}`);
}

/** Focus a row without the pointer: the list is one tab stop, so Tab to it and use the arrows from there. */
async function focusRow(page: Page, name: string): Promise<void> {
  const target = row(page, name);
  await tabTo(page, rows(page).first());
  for (let step = 0; step < 20 && !(await isFocused(target)); step += 1) await pressToMoveFocus(page, "ArrowDown");
  await expect(target).toBeFocused();
}

/** Open a row's ⋮ menu with the keyboard: Tab from the row to its button, Enter. */
async function openRowMenu(page: Page, name: string): Promise<void> {
  await focusRow(page, name);
  await tabTo(page, page.getByRole("button", { name: `More actions for ${name}` }).first());
  await page.keyboard.press("Enter");
}

/**
 * Press a key that moves focus and wait until focus has moved. Playwright sends keys with no pause; a menu or tree that takes a
 * frame to move focus drops the keys that arrive meanwhile (seen as the focus staying on one menu item through several presses).
 * A person cannot press that fast, so the test waits for each move instead of counting presses.
 */
async function pressToMoveFocus(page: Page, key: string): Promise<void> {
  await page.evaluate(() => { (window as unknown as { __focused: Element | null }).__focused = document.activeElement; });
  await page.keyboard.press(key);
  await page.waitForFunction(() => document.activeElement !== (window as unknown as { __focused: Element | null }).__focused, undefined, { timeout: 1500 }).catch(() => undefined);
}

/** Choose an item of an open menu or sheet with the arrows and Enter, by its name. */
async function chooseWithKeys(page: Page, layout: ReturnType<typeof layoutFor>, name: RegExp): Promise<void> {
  const item = layout === "compact" ? page.getByRole("dialog").getByRole("button", { name }) : page.getByRole("menuitem", { name });
  for (let step = 0; step < 14 && !(await isFocused(item)); step += 1) await pressToMoveFocus(page, layout === "compact" ? tabKey(page) : "ArrowDown");
  await expect(item).toBeFocused();
  await page.keyboard.press("Enter");
}

test.describe("keyboard only", () => {
  test("Files: search with /, move through the list with the arrows, Home and End, open a folder with Enter", async ({ page }) => {
    const folder = unique();
    await put(`${folder}/alpha.txt`);
    await put(`${folder}/bravo.txt`);
    await put(`${folder}/charlie.txt`);
    await put(`${folder}/sub/inner.txt`);
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "alpha.txt")).toBeVisible({ timeout: 15_000 });

    await focusRow(page, "alpha.txt");
    // The list moves focus one frame after the key, so wait for each move before the next key.
    await pressToMoveFocus(page, "End");
    await expect(row(page, "charlie.txt")).toBeFocused();
    await pressToMoveFocus(page, "Home");
    await expect(rows(page).first()).toBeFocused();
    await pressToMoveFocus(page, "ArrowDown");
    await pressToMoveFocus(page, "ArrowUp");
    await expect(rows(page).first()).toBeFocused();

    // `/` from the list goes to search; typing narrows; Escape clears and leaves it.
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox")).toBeFocused();
    await page.keyboard.type("bravo");
    await expect(rows(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(rows(page).first()).toBeVisible();

    // Enter opens a folder, and the address says so.
    await focusRow(page, "sub");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`#/files/${folder}/sub/?$`));
    await expect(row(page, "inner.txt")).toBeVisible({ timeout: 15_000 });
  });

  test("Selection and the preview: Space opens it, the arrows move through the files, Escape closes it and focus returns to the row", async ({ page }) => {
    const folder = unique();
    await put(`${folder}/one.txt`, "first file");
    await put(`${folder}/two.txt`, "second file");
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "one.txt")).toBeVisible({ timeout: 15_000 });

    await focusRow(page, "one.txt");
    await page.keyboard.press(" ");
    const viewer = page.locator('dialog[data-component="Preview"]');
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText("first file")).toBeVisible({ timeout: 15_000 });
    await expect(viewer.getByText("1 of 2")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText("second file")).toBeVisible({ timeout: 15_000 });
    await expect(viewer.getByText("2 of 2")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText("1 of 2")).toBeVisible();
    // Tab never reaches the page behind the viewer, and Escape closes it. In a modal <dialog> the browser's own controls are the
    // one place focus may leave to (the page then reports <body> as active), and the next Tab comes back in.
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press(tabKey(page));
      expect(await viewer.evaluate((element) => element.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(row(page, "one.txt")).toBeFocused();
  });

  test("Menus and dialogs: open the row menu, choose Rename, type, Enter; the toast's Undo is reached by Tab", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    const folder = unique();
    await put(`${folder}/old-name.txt`, "x");
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "old-name.txt")).toBeVisible({ timeout: 15_000 });

    await openRowMenu(page, "old-name.txt");
    await chooseWithKeys(page, layout, /^Rename/);
    const dialog = page.getByRole("dialog", { name: "Rename" });
    await expect(dialog).toBeVisible();
    // Focus is in the dialog, on its field.
    await expect(dialog.getByLabel("Name")).toBeFocused();
    // The dialog selects the name without its extension one frame after it opens; typing before that frame would be cut short.
    await expect.poll(() => dialog.getByLabel("Name").evaluate((field: HTMLInputElement) => field.selectionEnd)).toBe("old-name".length);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("new-name.txt");
    // Focus cannot leave the dialog: Tab around more times than it has controls.
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press(tabKey(page));
      // The browser's own controls are the one place focus may leave to; the page then reports <body> as active.
      expect(await dialog.evaluate((element) => element.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    await dialog.getByLabel("Name").focus();
    await page.keyboard.press("Enter");
    await expect(row(page, "new-name.txt")).toBeVisible({ timeout: 15_000 });
    const toast = page.locator('[data-component="Toast"]').filter({ hasText: /Renamed to new-name\.txt/ }).first();
    await expect(toast).toBeVisible();
    await tabTo(page, toast.getByRole("button", { name: "Undo" }));
    await page.keyboard.press("Enter");
    await expect(row(page, "old-name.txt")).toBeVisible({ timeout: 20_000 });
  });

  test("A dialog gives focus back to what opened it", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    const folder = unique();
    await put(`${folder}/focus-me.txt`, "x");
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "focus-me.txt")).toBeVisible({ timeout: 15_000 });
    await openRowMenu(page, "focus-me.txt");
    await chooseWithKeys(page, layout, /^Details/);
    const details = page.locator('[data-component="DetailsPanel"]');
    await expect(details).toBeVisible();
    if (layout === "sidebar") {
      // From 1024 px the panel is part of the page, not a dialog: Escape does not close it, its Close button does.
      await tabTo(page, details.getByRole("button", { name: "Close" }));
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }
    // A sheet stays in the page, closed; the in-layout panel is removed. Hidden covers both.
    await expect(details).toBeHidden();
    // Focus is not dropped on the page: it goes back to the control that opened the panel.
    await expect(page.getByRole("button", { name: "More actions for focus-me.txt" }).first()).toBeFocused();
  });

  test("Move dialog: the folder tree is walked with the arrows, Enter chooses a folder, and Move here is reached by Tab", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const layout = layoutFor(testInfo);
    const folder = unique();
    await put(`${folder}/mover.txt`, "x");
    await put(`${folder}/target/keep.txt`, "k");
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "mover.txt")).toBeVisible({ timeout: 15_000 });

    await openRowMenu(page, "mover.txt");
    await chooseWithKeys(page, layout, /^Move…/);
    const dialog = page.getByRole("dialog", { name: "Move 1 item" });
    const tree = dialog.getByRole("tree");
    await expect(tree.getByRole("treeitem", { name: /Current location/ })).toBeVisible({ timeout: 15_000 });
    const target = tree.getByRole("treeitem", { name: /^target/ });
    await tabTo(page, tree.getByRole("treeitem").first());
    // The tree lists every folder next to the current one, and a local bucket keeps the folders of earlier runs, so allow a long walk.
    for (let step = 0; step < 300 && !(await isFocused(target)); step += 1) await pressToMoveFocus(page, "ArrowDown");
    await expect(target).toBeFocused();
    await page.keyboard.press("Enter");
    const moveHere = dialog.getByRole("button", { name: "Move here" });
    await tabTo(page, moveHere);
    await expect(moveHere).toBeEnabled();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-component="Toast"]').filter({ hasText: "Moved mover.txt" }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("Share link: the choices are radios (arrows), Create and Copy link are reached by Tab, Escape closes", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    const folder = unique();
    await put(`${folder}/shared.txt`, "x");
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "shared.txt")).toBeVisible({ timeout: 15_000 });
    await openRowMenu(page, "shared.txt");
    await chooseWithKeys(page, layout, /^Share link/);
    const dialog = page.getByRole("dialog", { name: "Share link" });
    await expect(dialog).toBeVisible();
    const oneDay = dialog.getByRole("radio", { name: "1 day" });
    await tabTo(page, oneDay);
    await page.keyboard.press("ArrowUp");
    await expect(dialog.getByRole("radio", { name: "1 hour" })).toBeChecked();
    const create = dialog.getByRole("button", { name: "Create link for 1 hour" });
    await tabTo(page, create);
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("textbox", { name: "Link" })).toBeVisible();
    await tabTo(page, dialog.getByRole("button", { name: "Copy link" }));
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("Trash: move to trash, go to Trash from the navigation, select with Space, Restore and Delete forever with Enter", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    const folder = unique();
    await put(`${folder}/trashed.txt`, "x");
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "trashed.txt")).toBeVisible({ timeout: 15_000 });
    await openRowMenu(page, "trashed.txt");
    await chooseWithKeys(page, layout, /^Move to trash/);
    await expect(page.locator('[data-component="Toast"]').filter({ hasText: "Moved 1 item to trash" }).first()).toBeVisible();

    // The navigation's Trash link: in the rail and sidebar directly, behind More on a phone.
    if (layout === "compact") {
      await tabTo(page, page.getByRole("button", { name: "More" }));
      await page.keyboard.press("Enter");
      await tabTo(page, page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Trash" }));
    } else {
      await tabTo(page, page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trash" }));
    }
    await page.keyboard.press("Enter");
    const item = page.locator('[data-component="TrashRow"]').filter({ hasText: "trashed.txt" });
    await expect(item).toBeVisible({ timeout: 15_000 });
    await tabTo(page, item.getByRole("checkbox"));
    await page.keyboard.press(" ");
    await expect(item.getByRole("checkbox")).toBeChecked();
    const forever = page.getByRole("button", { name: "Delete forever" });
    await tabTo(page, forever);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await tabTo(page, dialog.getByRole("button", { name: "Delete forever" }));
    await page.keyboard.press("Enter");
    await expect(item).toHaveCount(0, { timeout: 15_000 });
  });

  test("New menu and upload: the menu opens with Enter, an item is chosen with the arrows, and the picker opens", async ({ page }, testInfo) => {
    const layout = layoutFor(testInfo);
    const folder = unique();
    await put(`${folder}/placeholder.txt`, "x");
    await enterApp(page, `/files/${folder}`);
    await expect(row(page, "placeholder.txt")).toBeVisible({ timeout: 15_000 });
    await tabTo(page, page.getByRole("button", { name: "New" }));
    await page.keyboard.press("Enter");
    const chooser = page.waitForEvent("filechooser");
    await chooseWithKeys(page, layout, /^Upload files/);
    await (await chooser).setFiles({ name: "from-keyboard.txt", mimeType: "text/plain", buffer: Buffer.from("typed by keys") });
    await expect(row(page, "from-keyboard.txt")).toBeVisible({ timeout: 20_000 });
  });

  test("Settings: pages are links, radios and switches work from the keyboard, Lock now asks, and Unlock is typed and submitted with Enter", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const layout = layoutFor(testInfo);
    await enterApp(page, "/settings", { passphrase: PASS });
    if (layout === "compact") {
      await tabTo(page, page.getByRole("link", { name: /^Security/ }));
      await page.keyboard.press("Enter");
    } else {
      await tabTo(page, page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Security" }));
    }
    await expect(page.getByRole("heading", { level: 2, name: "Security" })).toBeVisible();
    // Radios: arrows change the choice.
    await tabTo(page, page.getByRole("radio", { name: "15 minutes", exact: true }));
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "30 minutes", exact: true })).toBeChecked();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("radio", { name: "15 minutes", exact: true })).toBeChecked();

    const lock = page.getByRole("button", { name: "Lock now" });
    await tabTo(page, lock);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Lock Coffer now?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(lock).toBeFocused();
    await page.keyboard.press("Enter");
    await tabTo(page, dialog.getByRole("button", { name: "Lock now" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Coffer is locked" })).toBeVisible();

    // The locked screen: type the passphrase and press Enter. A wrong one says so; the right one opens the app.
    const field = page.getByLabel("Passphrase");
    await tabTo(page, field);
    await page.keyboard.type("not the passphrase");
    await page.keyboard.press("Enter");
    await expect(page.getByText("That passphrase doesn’t match.")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(PASS);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
  });

  test("Forget this device: the dialog is reached and answered with the keyboard, and the typed count enables the button", async ({ page }) => {
    await enterApp(page, "/settings/security", { passphrase: PASS });
    await tabTo(page, page.getByRole("button", { name: "Forget", exact: true }));
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Forget this device?" });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Forget this device" });
    await expect(confirm).toBeDisabled();
    await tabTo(page, dialog.getByLabel("Type 1 to confirm"));
    await page.keyboard.type("1");
    await expect(confirm).toBeEnabled();
    // Tab goes on to Cancel, and Escape leaves without forgetting.
    await tabTo(page, dialog.getByRole("button", { name: "Cancel" }));
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Forget", exact: true })).toBeFocused();
  });

  test("The skip link and the landmarks: the first Tab offers to skip to the content", async ({ page }) => {
    await enterApp(page, "/files");
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
    await page.keyboard.press(tabKey(page));
    const skip = page.getByRole("button", { name: /Skip to/ });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });
});
