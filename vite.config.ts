import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { copyGroups } from "./scripts/vite/copy-groups.ts";
import { appVersion, sourceUrl } from "./scripts/vite/app-version.ts";
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
  define: { __PROVIDER_COUNT__: JSON.stringify(providerCount()), __APP_VERSION__: JSON.stringify(appVersion()), __SOURCE_URL__: JSON.stringify(sourceUrl()) },
  resolve: {
    alias: {
      "@": root("./src"),
      "@design": root("./design"),
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    // A dynamic import of a module that is also imported statically splits nothing: the intent and the bundle differ,
    // so the build fails instead of warning.
    rolldownOptions: {
      onLog(level, log, handler) {
        if (log.code === "INEFFECTIVE_DYNAMIC_IMPORT") handler("error", log);
        else handler(level, log);
      },
    },
  },
});
