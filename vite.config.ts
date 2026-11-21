import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
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
