// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("lefthook.yml", "utf8");
const run = (hook: string) => new RegExp(`^${hook}:[\\s\\S]*?run:\\s*(.+)$`, "m").exec(config)?.[1]?.trim();

describe("lefthook.yml", () => {
  it("lints commit messages", () => {
    expect(run("commit-msg")).toBe("pnpm exec commitlint --edit {1}");
  });

  it("runs typecheck, lint and unit tests before a push, in that order, chained with &&", () => {
    expect(run("pre-push")).toBe("pnpm typecheck && pnpm lint && pnpm test");
  });

  it("never chains a gate with a semicolon or a pipe, which would hide a failure", () => {
    for (const line of config.split("\n").filter((text) => text.trim().startsWith("run:"))) {
      expect(line).not.toMatch(/;|\|(?!\|)/);
    }
  });
});
