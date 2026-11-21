import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root("./src"),
      "@design": root("./design"),
    },
  },
  test: {
    // Unit and component tests live next to the code. Files that need Node
    // instead of the DOM start with `// @vitest-environment node`.
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
  },
});
