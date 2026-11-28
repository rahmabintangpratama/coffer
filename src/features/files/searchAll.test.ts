import { describe, expect, it } from "vitest";
import { matchKeys, searchable } from "./searchAll";

describe("AC-23.6 search all of the bucket", () => {
  it("takes keys under the root and leaves out hidden names and the trash unless hidden files are shown", () => {
    expect(searchable("r/docs/a.pdf", "r/", false)).toBe(true);
    expect(searchable("other/a.pdf", "r/", false)).toBe(false);
    expect(searchable("r/", "r/", false)).toBe(false);
    expect(searchable("r/.coffer-trash/20261128T000000Z-abc123/a.pdf", "r/", false)).toBe(false);
    expect(searchable("r/docs/.env", "r/", false)).toBe(false);
    expect(searchable("r/.coffer-trash/20261128T000000Z-abc123/a.pdf", "r/", true)).toBe(true);
  });

  it("matches the last segment only, case-insensitive, folders included", () => {
    const keys = ["a/report.PDF", "pdf-folder/notes.txt", "x/pdfs/", "b/c/summary.pdf"];
    expect(matchKeys(keys, " pdf ")).toEqual(["a/report.PDF", "x/pdfs/", "b/c/summary.pdf"]);
    expect(matchKeys(keys, "")).toEqual([]);
  });
});
