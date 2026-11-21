import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import { importRules, restrictedImports, restrictedSyntax } from "./eslint.rules.js";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "node_modules/**",
      "design/**",
      "src/styles/*.css",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["*.js"] }, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-console": "error",
      "no-restricted-syntax": restrictedSyntax,
      "no-restricted-imports": restrictedImports(importRules.default),
    },
  },
  { files: ["src/app/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.app) } },
  { files: ["src/features/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.features) } },
  { files: ["src/components/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.components) } },
  { files: ["src/lib/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.lib) } },
  { files: ["src/lib/s3/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.libS3) } },
  { files: ["src/lib/storage/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.libStorage) } },
  { files: ["src/lib/providers/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.libProviders) } },
  { files: ["src/lib/i18n/**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(importRules.libI18n) } },
  {
    // Tests may use literals, and the logger-free rule does not apply to them.
    files: ["**/*.test.{ts,tsx}", "tests/**/*.ts"],
    rules: { "no-console": "off", "no-restricted-syntax": "off", "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["scripts/**/*.ts", "*.config.ts", "eslint.*.js"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
);
