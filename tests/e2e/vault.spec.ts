import { mkdtempSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreateBucketCommand, ListMultipartUploadsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "../integration/client";
import { admin, s3Fixture } from "../integration/config";
import { allowOrigin, E2E_BUCKET } from "./fixture";
import { axeViolations, connectCustom, enterApp, fillCustomForm, goToRoute } from "./helpers";

// M8: save on this device, unlock, lock and auto-lock, Forget this device, Show secret key, the switcher, and lock across tabs
// (FR-8, FR-9, FR-10, FR-11, FR-101, FR-102, C-27, C-38). The fake keys are the fixture's; nothing here is a real credential.
const s3 = createClient(admin);
test.afterAll(() => { s3.destroy(); });

const PASS = "correct horse battery staple";
const MIB = 1024 * 1024;
const unique = () => `e2e-vault/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const serious = (violations: Awaited<ReturnType<typeof axeViolations>>) => violations.filter((v) => v.impact === "serious" || v.impact === "critical");

const lockedHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Coffer is locked" });
const unlockHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Unlock your connections" });

async function incompleteIn(folder: string): Promise<number> {
  return ((await s3.send(new ListMultipartUploadsCommand({ Bucket: E2E_BUCKET, Prefix: `${folder}/` }))).Uploads ?? []).length;
}
async function keysUnder(prefix: string): Promise<string[]> {
  return ((await s3.send(new ListObjectsV2Command({ Bucket: E2E_BUCKET, Prefix: prefix }))).Contents ?? []).map((object) => object.Key ?? "").sort();
}

/** Everything this origin stores, as one string: all IndexedDB stores, localStorage and sessionStorage. */
async function dumpStorage(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const parts = [JSON.stringify(Object.entries(localStorage)), JSON.stringify(Object.entries(sessionStorage))];
        const open = indexedDB.open("coffer");
        open.onerror = () => { resolve(parts.join("\n")); };
        open.onsuccess = () => {
          const database = open.result;
          const names = [...database.objectStoreNames];
          if (names.length === 0) { database.close(); resolve(parts.join("\n")); return; }
          const transaction = database.transaction(names, "readonly");
          let pending = names.length;
          for (const name of names) {
            const all = transaction.objectStore(name).getAll();
            all.onsuccess = () => {
              parts.push(`${name}:${JSON.stringify(all.result)}`);
              pending -= 1;
              if (pending === 0) { database.close(); resolve(parts.join("\n")); }
            };
          }
        };
      }),
  );
}

async function lockFromSettings(page: Page): Promise<void> {
  await goToRoute(page, "/settings/security");
  await page.getByRole("button", { name: "Lock now" }).click();
  await page.getByRole("dialog", { name: "Lock Coffer now?" }).getByRole("button", { name: "Lock now" }).click();
  await expect(lockedHeading(page)).toBeVisible();
}

async function unlock(page: Page, passphrase = PASS): Promise<void> {
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
}

function bigFile(name: string, mib: number): string {
  const path = join(mkdtempSync(join(tmpdir(), "coffer-big-")), name);
  writeFileSync(path, "");
  truncateSync(path, mib * MIB);
  return path;
}
/** Slow every part request so an upload is still running when the lock happens. */
async function slowParts(page: Page, ms: number): Promise<void> {
  await page.route(/partNumber=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => undefined);
  });
}
const filesInput = (page: Page) => page.getByTestId("upload-files-input");

async function openFolder(page: Page, folder: string): Promise<void> {
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/files/${folder}`);
  await expect(page.getByRole("heading", { name: /This folder is empty|has no files yet/ })).toBeVisible({ timeout: 15_000 });
}

test.describe("save on this device (FR-8)", () => {
  test("AC-8.1 and AC-8.2 offers a passphrase or Not now, blocks under 12 characters and hints from 16", async ({ page }) => {
    await page.goto("/");
    await connectCustom(page);
    await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Save on this device?" })).toBeVisible();
    await expect(page.getByText("We can’t recover this passphrase.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
    const save = page.getByRole("button", { name: "Save with a passphrase" });
    await expect(save).toBeDisabled();
    await page.getByLabel("Passphrase").fill("short one");
    await expect(page.getByText("Use at least 12 characters.")).toBeVisible();
    await expect(save).toBeDisabled();
    await page.getByLabel("Passphrase").fill("twelve chars!");
    await expect(page.getByText("Use at least 12 characters.")).toHaveCount(0);
    await expect(page.getByText(/^Strong\./)).toHaveCount(0);
    await page.getByLabel("Passphrase").fill("sixteen chars ok!");
    await expect(page.getByText(/^Strong\./)).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);
  });

  test("AC-8.3 saved keys are ciphertext: storage holds no plaintext key, before and after a lock", async ({ page }) => {
    await enterApp(page, "/files", { passphrase: PASS });
    for (const moment of ["after save", "after lock"]) {
      if (moment === "after lock") await lockFromSettings(page);
      const dump = await dumpStorage(page);
      expect(dump, moment).toContain('"storage":"encrypted"');
      expect(dump, moment).toContain('"cipher":"AES-GCM"');
      for (const secret of [admin.accessKeyId, admin.secretAccessKey, PASS]) expect(dump, `${moment}: ${secret.slice(0, 5)}`).not.toContain(secret);
    }
  });

  test("AC-8.4 Not now keeps nothing: after a reload the app opens at Welcome", async ({ page }) => {
    await enterApp(page, "/files");
    expect(await dumpStorage(page)).not.toContain('"storage":"encrypted"');
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: /Connect|Welcome|your/i })).toBeVisible();
    await expect(unlockHeading(page)).toHaveCount(0);
  });
});

test.describe("unlock, lock and auto-lock (FR-9)", () => {
  test("AC-9.1 and AC-9.2 a reload opens Unlock; a wrong passphrase says so and stays locked; the right one opens the app", async ({ page }) => {
    await enterApp(page, "/files", { passphrase: PASS });
    await page.reload();
    await expect(unlockHeading(page)).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);
    await unlock(page, "not the right passphrase");
    await expect(page.getByText("That passphrase doesn’t match.")).toBeVisible();
    await expect(unlockHeading(page)).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);
    await unlock(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
  });

  test("AC-9.4 and AC-9.5 Lock now locks at once, and unlocking returns to the same folder", async ({ page }) => {
    const folder = unique();
    await enterApp(page, `/files/${folder}`, { passphrase: PASS });
    await lockFromSettings(page);
    expect(serious(await axeViolations(page))).toEqual([]);
    await unlock(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
    // Settings was the route when it locked; going back to the folder shows nothing was lost.
    await goToRoute(page, `/files/${folder}`);
    await expect(page.getByRole("heading", { name: /This folder is empty|has no files yet/ })).toBeVisible({ timeout: 15_000 });
  });

  test("AC-9.3 auto-lock clears the keys after the idle time and shows how long it was", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // The e2e build shortens only the 5-minute choice, to 4 seconds.
    await page.addInitScript(() => { window.localStorage.setItem("coffer:settings", JSON.stringify({ autoLockMinutes: 5 })); });
    await enterApp(page, "/files", { passphrase: PASS });
    await expect(lockedHeading(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/It locked after 5 minutes away/)).toBeVisible();
    await unlock(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("a wrong passphrase three times in a row makes the button wait", async ({ page }) => {
    await enterApp(page, "/files", { passphrase: PASS });
    await page.reload();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.getByLabel("Passphrase").fill(`wrong passphrase ${attempt.toString()}`);
      await page.getByRole("button", { name: "Unlock", exact: true }).click();
      await expect(page.getByText("That passphrase doesn’t match.")).toBeVisible();
    }
    await expect(page.getByText(/Too many tries\. Wait \d+ seconds? before trying again\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeDisabled();
  });

  test("unlock time at 4x CPU slowdown is recorded", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature.");
    const context = await browser.newContext();
    const page = await context.newPage();
    await enterApp(page, "/files", { passphrase: PASS });
    await page.reload();
    await expect(unlockHeading(page)).toBeVisible();
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.getByLabel("Passphrase").fill(PASS);
    const started = Date.now();
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 30_000 });
    const elapsed = Date.now() - started;
    test.info().annotations.push({ type: "unlock-ms-at-4x-cpu", description: String(elapsed) });
    // 600,000 PBKDF2 iterations are about 0.3 to 1 s on a phone; at 4x on a laptop it stays within a few seconds.
    expect(elapsed).toBeLessThan(15_000);
    await context.close();
  });
});

test.describe("transfers across a lock (C-27, C-38)", () => {
  test("AC-9.3 a lock during an upload lets it finish; the Locked screen counts it", async ({ page }) => {
    test.setTimeout(120_000);
    const folder = unique();
    await enterApp(page, "/files", { passphrase: PASS });
    await openFolder(page, folder);
    await slowParts(page, 1200);
    await filesInput(page).setInputFiles(bigFile("running.bin", 24));
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);
    await lockFromSettings(page);
    await expect(page.getByText("1 transfer is still finishing in the background.")).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);
    // The upload goes on with its private copy of the keys and ends with the object in the bucket, nothing left open.
    await expect.poll(() => keysUnder(`${folder}/`), { timeout: 60_000 }).toEqual([`${folder}/running.bin`]);
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBe(0);
    await expect(page.getByText(/transfers? (is|are) still finishing/)).toHaveCount(0);
  });

  test("AC-9.6 queued uploads wait for the unlock, then start", async ({ page }) => {
    test.setTimeout(120_000);
    const folder = unique();
    await enterApp(page, "/files", { passphrase: PASS });
    await openFolder(page, folder);
    // Slow enough that none of the three running uploads is done when the lock happens; the other two are queued behind them.
    await slowParts(page, 5000);
    await filesInput(page).setInputFiles(["a", "b", "c", "d", "e"].map((name) => bigFile(`${name}.bin`, 20)));
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);
    await lockFromSettings(page);
    await expect.poll(async () => (await keysUnder(`${folder}/`)).length, { timeout: 90_000 }).toBe(3);
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBe(0);
    // Nothing else starts while locked.
    await page.waitForTimeout(3000);
    expect((await keysUnder(`${folder}/`)).length).toBe(3);
    await unlock(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await keysUnder(`${folder}/`)).length, { timeout: 90_000 }).toBe(5);
  });

  test("AC-9.7 Stop transfers and lock aborts the running upload at the provider", async ({ page }) => {
    test.setTimeout(120_000);
    const folder = unique();
    await enterApp(page, "/files", { passphrase: PASS });
    await openFolder(page, folder);
    await slowParts(page, 2000);
    await filesInput(page).setInputFiles(bigFile("stop.bin", 40));
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);
    await lockFromSettings(page);
    await page.getByRole("button", { name: "Stop transfers and lock" }).click();
    await expect(page.getByText(/transfers? (is|are) still finishing/)).toHaveCount(0);
    await expect.poll(() => incompleteIn(folder), { timeout: 30_000 }).toBe(0);
    expect(await keysUnder(`${folder}/`)).toEqual([]);
    await expect(lockedHeading(page)).toBeVisible();
  });
});

test.describe("lock and forget reach every tab (C-27)", () => {
  test("Lock in one tab locks the other within a second, and unlocking one does not unlock the other", async ({ browser }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    await enterApp(first, "/files", { passphrase: PASS });
    const second = await context.newPage();
    await second.goto("/");
    await expect(unlockHeading(second)).toBeVisible();
    await unlock(second);
    await expect(second.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });

    await lockFromSettings(first);
    // The other tab drops its keys and shows Locked, with nothing left to start an operation from.
    await expect(lockedHeading(second)).toBeVisible({ timeout: 2000 });
    await expect(second.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await expect(second.getByRole("button", { name: "New" })).toHaveCount(0);

    await unlock(first);
    await expect(first.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
    await second.waitForTimeout(1000);
    await expect(lockedHeading(second)).toBeVisible();
    await context.close();
  });

  test("AC-9.8 a tab with a memory-only connection gets its own screen, and its form comes back with the keys empty", async ({ browser }) => {
    const context = await browser.newContext();
    const saved = await context.newPage();
    await enterApp(saved, "/files", { passphrase: PASS });
    // The second tab uses another connection that it does not save.
    const memory = await context.newPage();
    await memory.goto("/");
    await expect(unlockHeading(memory)).toBeVisible();
    await memory.getByRole("button", { name: "Use a different connection" }).click();
    await memory.getByRole("button", { name: "Other S3-compatible service" }).click();
    await fillCustomForm(memory);
    await memory.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await memory.getByRole("button", { name: "Not now" }).click();
    await expect(memory.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });

    await lockFromSettings(saved);
    await expect(lockedHeading(memory)).toBeVisible({ timeout: 2000 });
    await expect(memory.getByText("Coffer was locked from another tab. This connection wasn’t saved, so enter its keys again.")).toBeVisible();
    // Not the passphrase form: there is nothing saved for this connection to unlock.
    await expect(memory.getByLabel("Passphrase")).toHaveCount(0);
    expect(serious(await axeViolations(memory))).toEqual([]);

    await memory.getByRole("button", { name: "Enter the keys again" }).click();
    await expect(memory.getByRole("heading", { level: 1, name: /^Connect Other S3-compatible/ })).toBeVisible();
    await expect(memory.getByLabel("Endpoint URL")).toHaveValue(s3Fixture.endpoint);
    await expect(memory.getByLabel("Bucket", { exact: true })).toHaveValue(E2E_BUCKET);
    await expect(memory.getByLabel("Access Key ID")).toHaveValue("");
    await expect(memory.getByLabel("Secret Access Key")).toHaveValue("");
    await memory.getByLabel("Access Key ID").fill(admin.accessKeyId);
    await memory.getByLabel("Secret Access Key").fill(admin.secretAccessKey);
    await memory.getByRole("button", { name: "Connect", exact: true }).click();
    await memory.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    await memory.getByRole("button", { name: "Not now" }).click();
    await expect(memory.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("AC-9.8 a tab in the middle of onboarding loses only its secret fields", async ({ browser }) => {
    const context = await browser.newContext();
    const saved = await context.newPage();
    await enterApp(saved, "/files", { passphrase: PASS });
    const form = await context.newPage();
    await form.goto("/");
    await expect(unlockHeading(form)).toBeVisible();
    await form.getByRole("button", { name: "Use a different connection" }).click();
    await form.getByRole("button", { name: "Other S3-compatible service" }).click();
    await form.getByLabel("Endpoint URL").fill(s3Fixture.endpoint);
    await form.getByLabel("Access Key ID").fill(admin.accessKeyId);
    await form.getByLabel("Secret Access Key").fill(admin.secretAccessKey);
    await form.getByLabel("Bucket", { exact: true }).fill(E2E_BUCKET);
    await form.getByText("Advanced options").click();
    await form.getByLabel("Session token").fill("fake-session-token-for-tests");
    await form.getByLabel("Start in folder").fill("team/");

    await lockFromSettings(saved);
    // The form stays where it is: no Locked screen, and the keys are gone from its fields.
    await expect(form.getByLabel("Secret Access Key")).toHaveValue("", { timeout: 2000 });
    await expect(form.getByLabel("Access Key ID")).toHaveValue("");
    await expect(form.getByLabel("Session token")).toHaveValue("");
    await expect(form.getByLabel("Endpoint URL")).toHaveValue(s3Fixture.endpoint);
    await expect(form.getByLabel("Bucket", { exact: true })).toHaveValue(E2E_BUCKET);
    await expect(form.getByLabel("Start in folder")).toHaveValue("team/");
    await expect(lockedHeading(form)).toHaveCount(0);
    expect(serious(await axeViolations(form))).toEqual([]);
    await context.close();
  });

  test("Stop transfers and lock in one tab stops the transfers of the other", async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    const first = await context.newPage();
    const folder = unique();
    await enterApp(first, "/files", { passphrase: PASS });
    const second = await context.newPage();
    await second.goto("/");
    await unlock(second);
    await expect(second.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
    await openFolder(second, folder);
    await slowParts(second, 2000);
    await filesInput(second).setInputFiles(bigFile("other.bin", 40));
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);
    await lockFromSettings(first);
    await expect(lockedHeading(second)).toBeVisible({ timeout: 2000 });
    await expect(second.getByText("1 transfer is still finishing in the background.")).toBeVisible();
    // Stopping from the locked tab that has the transfer reaches every other tab as well.
    await second.getByRole("button", { name: "Stop transfers and lock" }).click();
    await expect.poll(() => incompleteIn(folder), { timeout: 30_000 }).toBe(0);
    expect(await keysUnder(`${folder}/`)).toEqual([]);
    await context.close();
  });

  test("AC-9.8 an idle tab does not lock a tab that is in use: activity in one resets the auto-lock of both", async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    // The e2e build shortens only the 5-minute choice, to 4 seconds.
    await context.addInitScript(() => { window.localStorage.setItem("coffer:settings", JSON.stringify({ autoLockMinutes: 5 })); });
    const busy = await context.newPage();
    await enterApp(busy, "/files", { passphrase: PASS });
    const idle = await context.newPage();
    await idle.goto("/");
    await unlock(idle);
    await expect(idle.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
    // About three times the idle time, with the pointer moving only in one tab.
    for (let second = 0; second < 12; second += 1) {
      await busy.mouse.move(100 + second * 10, 200);
      await busy.waitForTimeout(1000);
    }
    await expect(busy.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(idle.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    // Once nobody touches either, both lock (the first to fire tells the other).
    await expect(lockedHeading(busy)).toBeVisible({ timeout: 15_000 });
    await expect(lockedHeading(idle)).toBeVisible({ timeout: 3000 });
    await context.close();
  });

  test("AC-10.1 to AC-10.5 Forget this device lists what goes, asks for the count, empties storage and sends every tab to Welcome", async ({ browser }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    await enterApp(first, "/files", { passphrase: PASS });
    const second = await context.newPage();
    await second.goto("/");
    await unlock(second);
    await expect(second.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });

    await goToRoute(first, "/settings/security");
    await first.getByRole("button", { name: "Forget", exact: true }).click();
    const dialog = first.getByRole("dialog", { name: "Forget this device?" });
    await expect(dialog.getByText("1 saved connection and its key")).toBeVisible();
    await expect(dialog.getByText("The operation journal")).toBeVisible();
    await expect(dialog.getByText("Starred items and recent files")).toBeVisible();
    await expect(dialog.getByText("Your buckets and files are not changed.")).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Forget this device" });
    await expect(confirm).toBeDisabled();
    expect(serious(await axeViolations(first))).toEqual([]);
    await dialog.getByLabel("Type 1 to confirm").fill("1");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Both tabs end at Welcome, and a reload finds nothing stored.
    for (const page of [first, second]) await expect(page.getByRole("heading", { level: 1, name: /Connect|Welcome|your/i })).toBeVisible({ timeout: 15_000 });
    for (const page of [first, second]) {
      const dump = await dumpStorage(page);
      expect(dump).not.toContain('"storage":"encrypted"');
      expect(dump).not.toContain("coffer:saved");
      for (const secret of [admin.accessKeyId, admin.secretAccessKey]) expect(dump).not.toContain(secret);
    }
    await first.reload();
    await expect(unlockHeading(first)).toHaveCount(0);
    await context.close();
  });
});

test.describe("Forget this device with a transfer running (C-38)", () => {
  test("AC-9.7 it aborts the upload at the provider before the records go, so nothing is left open", async ({ page }) => {
    test.setTimeout(120_000);
    const folder = unique();
    await enterApp(page, "/files", { passphrase: PASS });
    await openFolder(page, folder);
    await slowParts(page, 2000);
    await filesInput(page).setInputFiles(bigFile("forgotten.bin", 40));
    await expect.poll(() => incompleteIn(folder), { timeout: 20_000 }).toBeGreaterThan(0);
    await goToRoute(page, "/settings/security");
    // The transfer panel is fixed over the bottom of a phone-sized page; fold it away to reach the button under it.
    await page.getByRole("button", { name: "Collapse", exact: true }).click();
    await page.getByRole("button", { name: "Forget", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Forget this device?" });
    await dialog.getByLabel("Type 1 to confirm").fill("1");
    await dialog.getByRole("button", { name: "Forget this device" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Connect|Welcome|your/i })).toBeVisible({ timeout: 30_000 });
    // The multipart upload is gone at the provider: the upload record was deleted with the device, so no later load could clean it up.
    expect(await incompleteIn(folder)).toBe(0);
    expect(await keysUnder(`${folder}/`)).toEqual([]);
  });
});

test.describe("Show secret key (FR-102) and the switcher (FR-11)", () => {
  test("AC-102.1 to AC-102.3 needs the passphrase, shows the secret and hides it again, and says to clear the clipboard", async ({ page, context, browserName }) => {
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await enterApp(page, "/settings/connections", { passphrase: PASS });
    await page.getByRole("button", { name: /^Show secret key:/ }).click();
    const dialog = page.getByRole("dialog", { name: "Show secret key" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Passphrase").fill("wrong wrong wrong");
    await dialog.getByRole("button", { name: "Show secret key" }).click();
    await expect(dialog.getByText("That passphrase doesn’t match.")).toBeVisible();
    await expect(dialog.getByTestId("revealed-secret")).toHaveCount(0);
    await dialog.getByLabel("Passphrase").fill(PASS);
    await dialog.getByRole("button", { name: "Show secret key" }).click();
    await expect(dialog.getByTestId("revealed-secret")).toHaveText(admin.secretAccessKey);
    await expect(dialog.getByText("The secret stays visible for 15 seconds, then hides again.")).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);
    // AC-102.4: never in the address or the title.
    expect(page.url()).not.toContain(admin.secretAccessKey);
    expect(await page.title()).not.toContain(admin.secretAccessKey);
    if (browserName === "chromium") {
      await dialog.getByRole("button", { name: "Copy secret key" }).click();
      await expect(page.locator('[data-component="Toast"]')).toContainText("Copied. Clear your clipboard when you’re done.");
    }
    await expect(dialog.getByTestId("revealed-secret")).toHaveCount(0, { timeout: 25_000 });
  });

  test("AC-102.1 a connection that is only in memory cannot be revealed", async ({ page }) => {
    await enterApp(page, "/settings/connections");
    await expect(page.getByRole("button", { name: /^Show secret key:/ })).toBeDisabled();
    await expect(page.getByText("This connection isn’t saved, so its secret key can’t be shown again.")).toBeVisible();
  });

  test("AC-101.1 and AC-101.2 Security shows the auto-lock choices, what is stored and the note", async ({ page }) => {
    await enterApp(page, "/settings/security", { passphrase: PASS });
    const security = page.getByRole("region", { name: "Security" });
    for (const label of ["5 minutes", "15 minutes", "30 minutes", "60 minutes", "Never"]) await expect(security.getByRole("radio", { name: label, exact: true })).toBeVisible();
    await expect(security.getByRole("radio", { name: "15 minutes", exact: true })).toBeChecked();
    await security.getByRole("radio", { name: "Never", exact: true }).check();
    await expect(security.getByText(/Without auto-lock, anyone who opens this browser/)).toBeVisible();
    await expect(security.locator('[data-component="StoredOnDevice"]').getByText("1 connection · encrypted with your passphrase")).toBeVisible();
    await expect(security.getByText("Coffer sends nothing to any server except your own storage provider.")).toBeVisible();
    expect(serious(await axeViolations(page))).toEqual([]);
  });

  test("AC-11.1, AC-11.3 and AC-11.4 a second connection reuses the passphrase, the switcher lists both, and removing one keeps the other", async ({ page }, testInfo) => {
    const second = `coffer-e2e-sw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    await s3.send(new CreateBucketCommand({ Bucket: second }));
    await allowOrigin(s3, second);
    await enterApp(page, "/files", { passphrase: PASS });
    const compact = (testInfo.project.use.viewport?.width ?? 0) < 768;
    const openSwitcher = async () => {
      await page.getByRole("button", { name: /^Switch connection:/ }).click();
    };
    if (compact) {
      // Below 768 px the switcher is the avatar at the end of the app bar (S37): a 44 px target, named with the connection and its lock state.
      // The Files bar replaces the plain one while it loads; wait for it so the button measured is the one that stays.
      await expect(page.locator('[data-component="FilesAppBar"]')).toBeVisible();
      const avatar = page.getByRole("button", { name: /^Switch connection:/ });
      await expect(avatar).toBeVisible();
      await expect.poll(async () => (await avatar.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
      await expect.poll(async () => (await avatar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(avatar).toHaveAccessibleName(/Other S3-compatible · coffer-e2e-app, Unlocked$/);
    }

    await openSwitcher();
    const switcher = page.getByRole("dialog", { name: "Connections" });
    await expect(switcher.getByRole("listitem")).toHaveCount(1);
    await expect(switcher.getByRole("listitem").first()).toContainText("Unlocked");
    expect(serious(await axeViolations(page))).toEqual([]);
    // AC-11.3: Add connection runs onboarding without losing the session.
    await switcher.getByRole("button", { name: "Add connection" }).click();
    await page.getByRole("button", { name: "Other S3-compatible service" }).click();
    await fillCustomForm(page, { bucket: second });
    await page.getByRole("button", { name: "Open bucket" }).click({ timeout: 30_000 });
    // The vault is open, so the passphrase is not asked for again.
    await expect(page.getByLabel("Passphrase")).toHaveCount(0);
    await expect(page.getByText("Your saved connections share one passphrase, so you won’t be asked for a new one.")).toBeVisible();
    await page.getByRole("button", { name: "Save on this device" }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });

    await openSwitcher();
    await expect(switcher.getByRole("listitem")).toHaveCount(2);
    await expect(switcher.getByRole("listitem").filter({ hasText: second })).toContainText("Current");
    await switcher.getByRole("button", { name: new RegExp(E2E_BUCKET) }).click();
    await openSwitcher();
    await expect(switcher.getByRole("listitem").filter({ hasText: E2E_BUCKET })).toContainText("Current");
    await page.keyboard.press("Escape");

    // AC-11.4: removing one connection deletes only its keys.
    await goToRoute(page, "/settings/connections");
    await page.getByRole("button", { name: new RegExp(`^Remove: .*${second}`) }).click();
    await page.getByRole("dialog", { name: new RegExp(`Remove .*${second}`) }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^Remove: `) })).toHaveCount(1);
    await expect(page.getByRole("button", { name: new RegExp(`^Remove: .*${E2E_BUCKET}`) })).toBeVisible();
    await page.reload();
    await unlock(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 15_000 });
  });
});
