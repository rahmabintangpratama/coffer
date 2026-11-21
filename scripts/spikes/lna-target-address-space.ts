// Spike for OQ-35 / D-29: can a page on a public https origin reach an http
// endpoint on a private IP or on loopback by passing `targetAddressSpace` to
// fetch, once the browser permits local network access?
//
// The page is a fake public origin (https://coffer.test) served through
// page.route(), which Chromium treats as a public address. The S3 fixture is
// reached through a small TCP forwarder bound to this machine's private IP,
// because the fixture itself listens on 127.0.0.1 only.
//
// Run: pnpm build && docker compose -f tests/integration/docker-compose.yml up -d --wait
//      node scripts/spikes/lna-target-address-space.ts [--channel chrome]
// Runs each experiment with the app's real CSP and with the CSP removed, because the CSP alone
// forbids http to a private IP. Prints one line per experiment. It needs a private IPv4 address on en0 (macOS) or $LNA_SPIKE_IP.
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer, connect } from "node:net";
import { chromium } from "@playwright/test";
import { startServer } from "../serve/dist-server.ts";

const PAGE_ORIGIN = "https://coffer.test";
const FIXTURE_PORT = 9000;
const FORWARD_PORT = 9100;
const channel = process.argv.includes("--channel") ? process.argv[process.argv.indexOf("--channel") + 1] : undefined;

function privateIp(): string {
  const fromEnv = process.env.LNA_SPIKE_IP;
  if (fromEnv) return fromEnv;
  const ip = execFileSync("ipconfig", ["getifaddr", "en0"], { encoding: "utf8" }).trim();
  if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) throw new Error(`en0 has no private IPv4 address (got "${ip}")`);
  return ip;
}

const ip = privateIp();
const forwarder = createTcpServer((client) => {
  const upstream = connect(FIXTURE_PORT, "127.0.0.1");
  client.pipe(upstream).pipe(client);
  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
});
await new Promise<void>((resolve) => forwarder.listen(FORWARD_PORT, ip, resolve));
const appServer = await startServer("dist", 4180);

const browser = await chromium.launch(channel ? { channel } : {});
console.log(`browser ${channel ?? "chromium"} ${browser.version()}; private endpoint http://${ip}:${FORWARD_PORT}`);

interface Outcome { reached: boolean; detail: string }
const experiments = [
  { name: "private IP, plain fetch", url: `http://${ip}:${FORWARD_PORT}/health`, init: {} },
  { name: "private IP, targetAddressSpace local", url: `http://${ip}:${FORWARD_PORT}/health`, init: { targetAddressSpace: "local" } },
  { name: "loopback, plain fetch", url: `http://127.0.0.1:${FIXTURE_PORT}/health`, init: {} },
  { name: "loopback, targetAddressSpace loopback", url: `http://127.0.0.1:${FIXTURE_PORT}/health`, init: { targetAddressSpace: "loopback" } },
] as const;

async function run(permission: "default" | "granted", csp: "app" | "none"): Promise<void> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  if (permission === "granted") {
    for (const name of ["local-network-access", "loopback-network", "local-network"]) {
      try {
        await context.grantPermissions([name], { origin: PAGE_ORIGIN });
        console.log(`  grantPermissions(${name}): accepted`);
      } catch (error) {
        console.log(`  grantPermissions(${name}): ${(error as Error).message.split("\n")[0]}`);
      }
    }
  }
  const page = await context.newPage();
  await page.route(`${PAGE_ORIGIN}/**`, async (route) => {
    const { pathname, search } = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:4180${pathname}${search}` });
    // "none" drops the app's CSP so the experiment shows what the browser itself allows.
    const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => csp === "app" || name !== "content-security-policy"));
    await route.fulfill({ response, headers });
  });
  const consoleLines: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleLines.push(message.text().slice(0, 200));
  });
  await page.goto(`${PAGE_ORIGIN}/`);
  const states = await page.evaluate(async () => {
    const read = async (name: string) => {
      try {
        return (await navigator.permissions.query({ name } as unknown as PermissionDescriptor)).state;
      } catch (error) {
        return `error: ${(error as Error).name}`;
      }
    };
    return { loopback: await read("loopback-network"), local: await read("local-network") };
  });
  console.log(`[permission ${permission}, app CSP ${csp === "app" ? "kept" : "removed"}] states: loopback-network=${states.loopback} local-network=${states.local}`);
  for (const experiment of experiments) {
    consoleLines.length = 0;
    const outcome = await page.evaluate(async ({ url, init }): Promise<Outcome> => {
      try {
        // no-cors: any answer counts as reached, so a CORS rule cannot hide the result.
        const response = await fetch(url, { ...init, mode: "no-cors", cache: "no-store" });
        return { reached: true, detail: `type=${response.type}` };
      } catch (error) {
        return { reached: false, detail: `${(error as Error).name}: ${(error as Error).message}` };
      }
    }, { url: experiment.url, init: experiment.init });
    console.log(`  ${experiment.name}: ${outcome.reached ? "REACHED" : "BLOCKED"} (${outcome.detail})${consoleLines[0] ? ` console: ${consoleLines[0]}` : ""}`);
  }
  await context.close();
}

try {
  for (const csp of ["app", "none"] as const) {
    await run("default", csp);
    await run("granted", csp);
  }
} finally {
  await browser.close();
  appServer.close();
  forwarder.close();
}
