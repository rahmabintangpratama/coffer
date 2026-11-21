import { describe, expect, it } from "vitest";
import type { FileItem, FolderItem } from "@/lib/types";
import { crumbsOf, filterItems, noFilters, pathFromPrefix, prefixFromPath, sortItems, withoutHidden, type Item } from "./model";

const file = (name: string, size = 1, lastModified = "2026-01-01T00:00:00Z", fileKind: FileItem["fileKind"] = "unknown"): FileItem => ({
  kind: "file", key: `d/${name}`, name, size, lastModified, etag: "e", contentType: "", fileKind,
});
const folder = (name: string): FolderItem => ({ kind: "folder", key: `d/${name}/`, name });
const names = (items: Item[]) => items.map((item) => item.name);

describe("AC-20.1 sorting", () => {
  const items = [file("b10.txt", 5), folder("zeta"), file("B2.txt", 9), folder("alpha"), file("a.txt", 1)];

  it("puts folders first, then files by numeric case-insensitive name", () => {
    expect(names(sortItems(items, { by: "name", dir: "asc" }))).toEqual(["alpha", "zeta", "a.txt", "B2.txt", "b10.txt"]);
  });
  it("reverses both groups for a descending name sort", () => {
    expect(names(sortItems(items, { by: "name", dir: "desc" }))).toEqual(["zeta", "alpha", "b10.txt", "B2.txt", "a.txt"]);
  });
  it("sorts files by size and keeps folders in name order", () => {
    expect(names(sortItems(items, { by: "size", dir: "desc" }))).toEqual(["alpha", "zeta", "B2.txt", "b10.txt", "a.txt"]);
  });
  it("sorts files by modified date, ties by name", () => {
    const dated = [file("b", 1, "2026-02-01T00:00:00Z"), file("a", 1, "2026-02-01T00:00:00Z"), file("c", 1, "2025-01-01T00:00:00Z")];
    expect(names(sortItems(dated, { by: "modified", dir: "asc" }))).toEqual(["c", "a", "b"]);
  });
  it("does not change the input", () => {
    const copy = [...items];
    sortItems(items, { by: "name", dir: "asc" });
    expect(items).toEqual(copy);
  });
});

describe("AC-23.1 and AC-23.2 filters", () => {
  const now = Date.parse("2026-06-15T12:00:00Z");
  const items = [
    folder("Reports"),
    file("report.PDF", 1, "2026-06-15T08:00:00Z", "pdf"),
    file("photo.png", 1, "2026-06-01T00:00:00Z", "image"),
    file("logo.svg", 1, "2025-01-01T00:00:00Z", "svg"),
    file("notes.md", 1, "2026-06-14T00:00:00Z", "markdown"),
  ];

  it("matches names by case-insensitive substring", () => {
    expect(names(filterItems(items, { ...noFilters, query: "REPORT" }, now))).toEqual(["Reports", "report.PDF"]);
  });
  it("narrows by type, counting svg as an image and markdown as a document", () => {
    expect(names(filterItems(items, { ...noFilters, type: "image" }, now))).toEqual(["photo.png", "logo.svg"]);
    expect(names(filterItems(items, { ...noFilters, type: "document" }, now))).toEqual(["notes.md"]);
    expect(names(filterItems(items, { ...noFilters, type: "folder" }, now))).toEqual(["Reports"]);
  });
  it("narrows by modified window and drops folders, which have no date", () => {
    expect(names(filterItems(items, { ...noFilters, modified: "today" }, now))).toEqual(["report.PDF"]);
    expect(names(filterItems(items, { ...noFilters, modified: "month" }, now))).toEqual(["report.PDF", "photo.png", "notes.md"]);
  });
  it("combines them", () => {
    expect(names(filterItems(items, { query: "o", type: "image", modified: "month" }, now))).toEqual(["photo.png"]);
  });
  it("ignores a query of only spaces", () => {
    expect(filterItems(items, { ...noFilters, query: "  " }, now)).toHaveLength(5);
  });
});

describe("FR-20 hidden files", () => {
  it("hides dot names unless asked", () => {
    const items = [file(".env"), file("a"), folder(".git")];
    expect(names(withoutHidden(items, false))).toEqual(["a"]);
    expect(names(withoutHidden(items, true))).toHaveLength(3);
  });
});

describe("AC-22.5 paths", () => {
  it("round-trips awkward names through the hash path", () => {
    const prefix = "a b/100%/#?+/日本/";
    expect(prefixFromPath(pathFromPrefix(prefix))).toBe(prefix);
    expect(pathFromPrefix(prefix)).not.toMatch(/[#?+ ]/);
  });
  it("does not decode twice: a literal %41 stays", () => {
    expect(prefixFromPath(pathFromPrefix("x/%41/"))).toBe("x/%41/");
  });
  it("maps the files root, and a path with no folder in it, to the empty prefix", () => {
    expect(prefixFromPath("/files")).toBe("");
    expect(prefixFromPath("/files/")).toBe("");
    expect(prefixFromPath("/")).toBe("");
    expect(pathFromPrefix("")).toBe("/files");
  });
  it("builds breadcrumb parts with the prefix that opens each", () => {
    expect(crumbsOf("a/b/")).toEqual([{ name: "a", prefix: "a/" }, { name: "b", prefix: "a/b/" }]);
    expect(crumbsOf("")).toEqual([]);
  });
});
