import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { copyGroups } from "./scripts/vite/copy-groups.ts";
import { stripAgentDocs } from "./scripts/vite/strip-agent-docs.ts";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), copyGroups(), stripAgentDocs()],
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
