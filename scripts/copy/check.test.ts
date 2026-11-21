// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findKeyUses, findUnknownKeys, flatten, mergeCopy } from "./check.ts";

const design = { app: { name: "Coffer" }, files: { emptyBucket: { body: "old", title: "t" } } };

describe("copy check", () => {
  it("flattens nested copy to dotted keys", () => {
    expect([...flatten(design).keys()]).toEqual(["app.name", "files.emptyBucket.body", "files.emptyBucket.title"]);
  });

  it("merges additions and lets the listed override win", () => {
    const { keys, problems } = mergeCopy(design, { files: { emptyBucket: { body: "new" } }, act: { restore: "Restore" } });
    expect(problems).toEqual([]);
    expect(keys.get("files.emptyBucket.body")).toBe("new");
    expect(keys.get("act.restore")).toBe("Restore");
  });

  it("rejects an override that is not listed", () => {
    const { problems } = mergeCopy(design, { app: { name: "Other" } });
    expect(problems.join("\n")).toContain("overrides a design key");
  });

  it("rejects a string where the design has a group, and the reverse", () => {
    expect(mergeCopy(design, { files: { emptyBucket: "x" } }).problems.join("\n")).toContain("group at that path");
    expect(mergeCopy(design, { app: { name: { first: "x" } } }).problems.join("\n")).toContain("needs app.name to be a group");
  });

  it("finds t() key references with line numbers", () => {
    const uses = findKeyUses("a.tsx", "const a = t('app.name');\n\nconst b = t(\"missing.key\");\nconst c = format('x');");
    expect(uses).toEqual([
      { file: "a.tsx", line: 1, key: "app.name" },
      { file: "a.tsx", line: 3, key: "missing.key" },
    ]);
  });

  it("reports only keys that do not exist", () => {
    const { keys } = mergeCopy(design, {});
    const unknown = findUnknownKeys(findKeyUses("a.tsx", "t('app.name'); t('nope.nope');"), keys);
    expect(unknown.map((use) => use.key)).toEqual(["nope.nope"]);
  });
});
