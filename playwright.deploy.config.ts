import { defineConfig } from "@playwright/test";
import { normalizeBase } from "./scripts/deploy/base.ts";
import base from "./playwright.config.ts";

// ADR-010: the header and CSP specs against dist/ served by the generated nginx or Caddy configuration, in a container.
// COFFER_DEPLOY_HOST is "nginx" (default), "caddy" or "github-pages" (the degraded build, served with no headers); with
// COFFER_BASE the build is served under that path.
const host = process.env.COFFER_DEPLOY_HOST ?? "nginx";
// The specs read it too, in their own processes.
process.env.COFFER_DEPLOY_HOST = host;
const path = normalizeBase(process.env.COFFER_BASE);
const origin = "http://127.0.0.1:4173";

export default defineConfig({
  ...base,
  // The other specs open "/", which a subpath deployment does not serve.
  testMatch: path === "/" && host !== "github-pages" ? ["deploy.spec.ts", "csp.spec.ts", "brand.spec.ts", "onboarding.spec.ts", "preview.spec.ts"] : ["deploy.spec.ts"],
  use: { ...base.use, baseURL: `${origin}${path}` },
  projects: (base.projects ?? []).filter((project) => project.name === "chromium-1440"),
  webServer: {
    command: host === "github-pages" ? "COFFER_TARGET=github-pages pnpm build && node scripts/serve/dist-server.ts --no-headers --port 4173" : `pnpm build && node scripts/deploy/serve.ts ${host}`,
    url: `${origin}${path}`,
    // Always the server under test, never one left on the port.
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    timeout: 180_000,
  },
});
