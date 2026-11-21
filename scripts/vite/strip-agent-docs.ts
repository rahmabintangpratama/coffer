import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/**
 * Vite copies every file of public/ into dist/. public/ holds AGENTS.md and CLAUDE.md
 * for the agents that work in it; they are not part of the site and must not be served
 * (C-22: public/ ships a short allowlist and nothing else).
 */
export function stripAgentDocs(): Plugin {
  let outDir = "dist";
  return {
    name: "coffer:strip-agent-docs",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const name of ["AGENTS.md", "CLAUDE.md"]) rmSync(join(outDir, name), { force: true });
    },
  };
}
