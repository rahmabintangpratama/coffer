import { describe, expect, it } from "vitest";
import { addPage, emptyUsage, estimateRequests, largestFolders } from "./usage";

describe("FR-90 usage totals", () => {
  it("AC-90.2 and AC-90.3 counts objects, bytes and requests, grouped by top-level folder under the root", () => {
    let usage = addPage(emptyUsage(), [{ key: "r/a/1", size: 10 }, { key: "r/a/b/2", size: 5 }, { key: "r/top.txt", size: 1 }], "r/");
    usage = addPage(usage, [{ key: "r/z/3", size: 100 }, { key: "other/x", size: 999 }], "r/");
    expect(usage).toMatchObject({ objects: 4, bytes: 116, requests: 2 });
    expect(largestFolders(usage)).toEqual([
      { name: "z", bytes: 100, objects: 1 },
      { name: "a", bytes: 15, objects: 2 },
      { name: "", bytes: 1, objects: 1 },
    ]);
  });

  it("orders ties by name, numerically, and keeps the limit", () => {
    const usage = addPage(emptyUsage(), [{ key: "f10/x", size: 1 }, { key: "f2/x", size: 1 }, { key: "f1/x", size: 1 }], "");
    expect(largestFolders(usage, 2).map((folder) => folder.name)).toEqual(["f1", "f2"]);
  });

  it("AC-90.1 estimates one request per 1,000 objects, at least one", () => {
    expect(estimateRequests(0)).toBe(1);
    expect(estimateRequests(1000)).toBe(1);
    expect(estimateRequests(1001)).toBe(2);
    expect(estimateRequests(2_500_000)).toBe(2500);
  });
});
