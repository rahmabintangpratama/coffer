import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { copyGroups } from "./scripts/vite/copy-groups.ts";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Feature code that the tests import (restore planning) reads copy through the virtual modules.
  plugins: [copyGroups()],
  resolve: { alias: { "@": root("./src"), "@design": root("./design") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/cleanup-file.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
