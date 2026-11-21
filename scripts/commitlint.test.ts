// @vitest-environment node
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function lint(message: string): { ok: boolean; output: string } {
  const result = spawnSync("pnpm", ["exec", "commitlint"], { input: message, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
}

describe("commit message rules", () => {
  it("accepts a Conventional Commit with and without a scope", () => {
    expect(lint("docs: add project README").ok).toBe(true);
    expect(lint("feat(preview): add image zoom").ok).toBe(true);
  });

  it("accepts a body wrapped under 100 characters", () => {
    expect(lint("fix: handle empty listings\n\nAn empty prefix returned nothing, so the list stayed blank.").ok).toBe(true);
  });

  it.each([
    ["no type", "add project README", "type-empty"],
    ["unknown type", "wip: add thing", "type-enum"],
    ["capitalized subject", "feat: Add thing", "subject-case"],
    ["trailing period", "feat: add thing.", "subject-full-stop"],
    ["header over 72 characters", `feat: ${"a".repeat(70)}`, "header-max-length"],
  ])("rejects %s", (_name, message, rule) => {
    const result = lint(message);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(rule);
  });
});
