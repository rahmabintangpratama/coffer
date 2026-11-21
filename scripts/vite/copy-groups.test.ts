// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CORE_GROUPS } from "../../src/lib/i18n/groups.ts";
import { copyGroups, mergeTrees, splitGroups } from "./copy-groups.ts";

describe("mergeTrees", () => {
  it("merges nested groups and lets the override win", () => {
    expect(mergeTrees({ a: { x: "1", y: "2" }, b: "k" }, { a: { y: "Y", z: "Z" }, c: "n" })).toEqual({
      a: { x: "1", y: "Y", z: "Z" },
      b: "k",
      c: "n",
    });
  });
});

describe("splitGroups", () => {
  const merged = Object.fromEntries([...CORE_GROUPS, "ob", "pv"].map((name) => [name, { key: name }]));

  it("keeps the core groups together and every other group on its own", () => {
    const { core, lazy } = splitGroups(merged);
    expect(Object.keys(core).sort()).toEqual([...CORE_GROUPS].sort());
    expect(Object.keys(lazy).sort()).toEqual(["ob", "pv"]);
  });

  it("fails when a core group is missing or a top-level key is a string", () => {
    const withoutNav = Object.fromEntries(Object.entries(merged).filter(([name]) => name !== "nav"));
    expect(() => splitGroups(withoutNav)).toThrow('core group "nav"');
    expect(() => splitGroups({ ...merged, loose: "text" })).toThrow('"loose" must be a group');
  });
});

describe("copyGroups plugin", () => {
  const plugin = copyGroups();
  const resolve = plugin.resolveId as (source: string) => string | null;
  const load = plugin.load as (this: { addWatchFile: (file: string) => void }, id: string) => string | null;
  const context = { addWatchFile: () => undefined };

  it("resolves only its own virtual ids", () => {
    expect(resolve("virtual:copy/core")).toBe("\0virtual:copy/core");
    expect(resolve("react")).toBeNull();
  });

  it("serves the core groups with their strings", () => {
    const code = load.call(context, "\0virtual:copy/core") ?? "";
    expect(code).toContain('"Coffer"');
    expect(code).not.toContain("Connect a bucket");
  });

  it("serves a feature group on its own, with the additions merged in", () => {
    const code = load.call(context, "\0virtual:copy/ob") ?? "";
    expect(code).toContain("Connect a bucket");
    expect(code).toContain("Stop transfers and lock");
  });

  it("lists a dynamic import for each feature group and none for the core", () => {
    const code = load.call(context, "\0virtual:copy/loaders") ?? "";
    expect(code).toContain('import("virtual:copy/ob")');
    expect(code).not.toContain('"nav"');
  });

  it("refuses an unknown group", () => {
    expect(() => load.call(context, "\0virtual:copy/nope")).toThrow("unknown or core group");
  });
});
