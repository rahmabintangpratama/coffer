import type { Linter } from "eslint";

export interface ImportPattern {
  group: string[];
  message: string;
}
export const importRules: Record<
  "default" | "app" | "features" | "components" | "lib" | "libS3" | "libStorage" | "libProviders" | "libI18n",
  ImportPattern[]
>;
export function restrictedImports(patterns: ImportPattern[]): Linter.RuleEntry;
export const syntaxRules: { selector: string; message: string }[];
export const restrictedSyntax: Linter.RuleEntry;
export const nonModalRule: { selector: string; message: string };
