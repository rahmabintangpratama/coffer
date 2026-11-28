import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { metaTags, readConfig, renderHeadersFile } from "../deploy/render.ts";

/** `COFFER_TARGET`: unset for a host that sends headers, or the one degraded tier. */
export type DeployTarget = "headers" | "github-pages";

export function deployTarget(input: string | undefined): DeployTarget {
  if (input === undefined || input === "") return "headers";
  if (input === "github-pages") return input;
  throw new Error(`COFFER_TARGET must be empty or "github-pages", got "${input}".`);
}

const CHARSET = '<meta charset="UTF-8" />';

/** The policy as meta elements, right after the charset and so before the first script (ADR-010, GitHub Pages only). */
export function withMetaPolicy(html: string, tags: readonly string[]): string {
  if (!html.includes(CHARSET)) throw new Error("index.html has no charset element to put the policy after.");
  return html.replace(CHARSET, [CHARSET, ...tags].join("\n    "));
}

/**
 * What the host needs from a build (ADR-010): `dist/_headers` with the base in its paths and, for a host that sends no
 * headers, the policy inside the page.
 */
export function deploy(base: string, target: DeployTarget): Plugin {
  let outDir = "dist";
  return {
    name: "coffer:deploy",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "post",
      handler: (html) => (target === "github-pages" ? withMetaPolicy(html, metaTags(readConfig())) : html),
    },
    // After Vite copied public/ into dist/.
    closeBundle() {
      writeFileSync(join(outDir, "_headers"), renderHeadersFile(readConfig(), base));
    },
  };
}
