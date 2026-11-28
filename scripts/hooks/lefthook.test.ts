// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("lefthook.yml", "utf8");
const run = (hook: string) => new RegExp(`^${hook}:[\\s\\S]*?run:\\s*(.+)$`, "m").exec(config)?.[1]?.trim();

describe("lefthook.yml", () => {
  it("lints commit messages", () => {
    expect(run("commit-msg")).toBe("pnpm exec commitlint --edit {1}");
  });

  it("runs the local gates before a push", () => {
    expect(run("pre-push")).toBe("pnpm gates");
  });

  it("pnpm gates runs typecheck, lint, the copy and token checks and the unit tests, in that order, chained with &&", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(scripts.gates).toBe("pnpm typecheck && pnpm lint && pnpm copy:check && pnpm tokens:check && pnpm test");
  });

  it("never chains a gate with a semicolon or a pipe, which would hide a failure", () => {
    for (const line of config.split("\n").filter((text) => text.trim().startsWith("run:"))) {
      expect(line).not.toMatch(/;|\|(?!\|)/);
    }
  });
});
