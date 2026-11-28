import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBase } from "./base.ts";
import { readConfig, renderCaddy, renderNginx } from "./render.ts";

/**
 * Serve dist/ with the generated nginx or Caddy configuration in a container, on 127.0.0.1:4173. Test tooling for
 * playwright.deploy.config.ts: `node scripts/deploy/serve.ts nginx|caddy`, with COFFER_BASE for a subpath build.
 * Images are pinned by digest (tag in the comment).
 */
export const IMAGES = {
  nginx: "nginx@sha256:8eb04fe3b385090e9aa02961f77398ad09b6bf33ab07f6669a5bb7acce22c0d3", // stable-alpine, 1.30.8
  caddy: "caddy@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0", // 2-alpine, 2.11.9
} as const;
export type Host = keyof typeof IMAGES;

export function dockerArgs(host: Host, dist: string, configFile: string, base: string, port: number): string[] {
  const [root, target] = host === "nginx" ? ["/usr/share/nginx/html", "/etc/nginx/conf.d/default.conf"] : ["/srv", "/etc/caddy/Caddyfile"];
  return [
    "run", "--rm", "--init", "--name", `coffer-deploy-${host}`,
    "-p", `127.0.0.1:${String(port)}:8080`,
    "-v", `${dist}:${root}${base.slice(0, -1)}:ro`,
    "-v", `${configFile}:${target}:ro`,
    IMAGES[host],
  ];
}

function main(): void {
  const host = process.argv[2];
  if (host !== "nginx" && host !== "caddy") {
    console.error("Usage: node scripts/deploy/serve.ts nginx|caddy");
    process.exit(1);
  }
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  const base = normalizeBase(process.env.COFFER_BASE);
  const dir = mkdtempSync(join(tmpdir(), "coffer-deploy-"));
  const configFile = join(dir, "config");
  writeFileSync(configFile, (host === "nginx" ? renderNginx : renderCaddy)(readConfig(), base));
  // The server in the container runs as another user and reads the mounted file.
  chmodSync(dir, 0o755);
  chmodSync(configFile, 0o644);
  // A container left behind by a run that was killed holds the name and the port.
  spawnSync("docker", ["rm", "-f", `coffer-deploy-${host}`], { stdio: "ignore" });
  const child = spawn("docker", dockerArgs(host, resolve(repo, "dist"), configFile, base, 4173), { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { child.kill(signal); });
  child.on("exit", (code) => { process.exit(code ?? 1); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
