// @vitest-environment node
import { ESLint, Linter } from "eslint";
import { describe, expect, it } from "vitest";
import tseslint from "typescript-eslint";

// Asks the real project config which rules apply to a path, then runs just the
// project-specific rules on a code sample. This checks both the rules and the
// per-directory mapping in eslint.config.js.
const eslint = new ESLint({ overrideConfigFile: "eslint.config.js" });
const linter = new Linter();

async function messages(filePath: string, code: string): Promise<string[]> {
  const resolved = (await eslint.calculateConfigForFile(filePath)) as { rules?: Linter.RulesRecord };
  const rules: Linter.RulesRecord = {};
  for (const name of ["no-console", "no-restricted-syntax", "no-restricted-imports"]) {
    const entry = resolved.rules?.[name];
    if (entry !== undefined) rules[name] = entry;
  }
  const result = linter.verify(
    code,
    [
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules,
      },
    ],
    { filename: filePath },
  );
  return result.map((m) => `${m.ruleId ?? "parse"}: ${m.message}`);
}

describe("project lint rules", () => {
  it("bans console in src but not in scripts", async () => {
    expect(await messages("src/app/x.ts", "console.log('x');")).toEqual([expect.stringContaining("no-console")]);
    expect(await messages("scripts/x.ts", "console.log('x');")).toEqual([]);
  });

  it("bans dangerouslySetInnerHTML", async () => {
    const out = await messages("src/features/a/x.tsx", "export const a = <div dangerouslySetInnerHTML={{ __html: '' }} />;");
    expect(out.join("\n")).toContain("Never render bucket data as HTML");
  });

  it("bans hard-coded colors and arbitrary pixel sizes", async () => {
    expect((await messages("src/components/x.ts", "export const c = '#1a2b3c';")).join()).toContain("No hard-coded colors");
    expect((await messages("src/components/x.ts", "export const c = 'rgba(0, 0, 0, 0.5)';")).join()).toContain("No hard-coded colors");
    expect((await messages("src/components/x.ts", "export const c = 'w-[13px]';")).join()).toContain("arbitrary pixel sizes");
    expect(await messages("src/components/x.ts", "export const c = 'bg-surface text-fg';")).toEqual([]);
  });

  it("keeps src/lib free of React and upper layers", async () => {
    expect((await messages("src/lib/s3/x.ts", "import { useState } from 'react';")).join()).toContain("no React");
    expect((await messages("src/lib/storage/x.ts", "import { Button } from '@/components/button';")).join()).toContain("must not import components");
  });

  it("keeps lib/storage away from lib/s3 and lib/providers", async () => {
    expect((await messages("src/lib/storage/x.ts", "import { x } from '@/lib/s3/client';")).join()).toContain("must not import lib/s3");
    expect((await messages("src/lib/storage/x.ts", "import { x } from '@/lib/providers/load';")).join()).toContain("lib/providers");
  });

  it("keeps components free of features, app and storage", async () => {
    expect((await messages("src/components/x.ts", "import { x } from '@/features/browse';")).join()).toContain("must not import features");
    expect((await messages("src/components/x.ts", "import { x } from '@/lib/storage/vault';")).join()).toContain("lib/storage");
  });

  it("lets only lib/s3 import the AWS SDK", async () => {
    expect((await messages("src/features/a/x.ts", "import { S3Client } from '@aws-sdk/client-s3';")).join()).toContain("Only src/lib/s3");
    expect(await messages("src/lib/s3/x.ts", "import { S3Client } from '@aws-sdk/client-s3';")).toEqual([]);
  });
});
