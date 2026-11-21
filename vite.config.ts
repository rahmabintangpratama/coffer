import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { copyGroups } from "./scripts/vite/copy-groups.ts";
import { providerCount } from "./scripts/vite/provider-count.ts";
import { stripAgentDocs } from "./scripts/vite/strip-agent-docs.ts";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    copyGroups(),
    stripAgentDocs(),
    // `pnpm size:analyze` writes per-module sizes next to dist/, outside it (dist/ ships only what C-22 allows).
    ...(process.env.COFFER_ANALYZE === "1" ? [visualizer({ filename: "bundle-stats.json", template: "raw-data", gzipSize: true })] : []),
  ],
  define: { __PROVIDER_COUNT__: JSON.stringify(providerCount()) },
  resolve: {
    alias: {
      "@": root("./src"),
      "@design": root("./design"),
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
