import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { copyGroups } from "./scripts/vite/copy-groups.ts";
import { appVersion, sourceUrl } from "./scripts/vite/app-version.ts";
import { providerCount } from "./scripts/vite/provider-count.ts";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [copyGroups()],
  define: { __PROVIDER_COUNT__: JSON.stringify(providerCount()), __APP_VERSION__: JSON.stringify(appVersion()), __SOURCE_URL__: JSON.stringify(sourceUrl()) },
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
