import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "./test";
import { enterApp, goToRoute } from "./helpers";

// FR-10, C-61: Forget this device removes what Coffer owns and nothing else on the origin. Another app on the same
// origin is stood for by data seeded here and a service worker served from its own folder.
const PASS = "correct horse battery staple";
const folder = `zz-other-app-${Math.random().toString(36).slice(2, 8)}`;
const dir = fileURLToPath(new URL(`../../dist/${folder}/`, import.meta.url));

test.beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}sw.js`, "self.addEventListener('install', () => { self.skipWaiting(); });\n");
});
test.afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

test("AC-10.6 Forget this device leaves another app's database, storage, cache and service worker", async ({ page, browserName }) => {
  await enterApp(page, "/files", { passphrase: PASS });
  await page.evaluate(async (scope) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("other-app", 1);
      open.onupgradeneeded = () => { open.result.createObjectStore("things"); };
      open.onerror = () => { reject(new Error("open")); };
      open.onsuccess = () => {
        const write = open.result.transaction("things", "readwrite");
        write.objectStore("things").put("stay", "k");
        write.oncomplete = () => { open.result.close(); resolve(); };
      };
    });
    localStorage.setItem("other:key", "stay");
    sessionStorage.setItem("other:session", "stay");
    await (await caches.open("other-app-v1")).put("/other-app-item", new Response("stay"));
    await navigator.serviceWorker.register(`${scope}sw.js`, { scope });
  }, `/${folder}/`);

  await goToRoute(page, "/settings/security");
  await page.getByRole("button", { name: "Forget", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Forget this device?" });
  await dialog.getByLabel("Type 1 to confirm").fill("1");
  await dialog.getByRole("button", { name: "Forget this device" }).click();
  await expect(page.getByRole("button", { name: "Connect a bucket" })).toBeVisible({ timeout: 20_000 });

  const left = await page.evaluate(async () => ({
    databases: (await indexedDB.databases()).map((database) => database.name).sort(),
    record: await new Promise<unknown>((resolve) => {
      const open = indexedDB.open("other-app");
      open.onsuccess = () => {
        const read = open.result.transaction("things").objectStore("things").get("k");
        read.onsuccess = () => { open.result.close(); resolve(read.result); };
      };
    }),
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage),
    caches: await caches.keys(),
    cached: await (await (await caches.open("other-app-v1")).match("/other-app-item"))?.text(),
    workers: (await navigator.serviceWorker.getRegistrations()).map((registration) => new URL(registration.scope).pathname),
  }));
  // Playwright's WebKit drops cache entries on any reload, with or without Forget; the cache itself stays.
  const cached = browserName === "webkit" ? left.cached : "stay";
  expect(left).toEqual({ databases: ["other-app"], record: "stay", local: ["other:key"], session: ["other:session"], caches: ["other-app-v1"], cached, workers: [`/${folder}/`] });
});
