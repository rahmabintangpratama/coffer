import { describe, expect, it } from "vitest";
import { topLevelItems, toTrashItems, withDescendants } from "./model";

const BATCH = "20261128T101500Z-abc123";
const OTHER = "20261128T111500Z-def456";
const items = toTrashItems("", [
  { key: `.coffer-trash/${BATCH}/a/`, size: 0 },
  { key: `.coffer-trash/${BATCH}/a/b/`, size: 0 },
  { key: `.coffer-trash/${BATCH}/a/b/c.txt`, size: 3 },
  { key: `.coffer-trash/${BATCH}/a/top.txt`, size: 1 },
  { key: `.coffer-trash/${BATCH}/loose.txt`, size: 1 },
  // The same path trashed again in another batch is its own row.
  { key: `.coffer-trash/${OTHER}/a/b/c.txt`, size: 3 },
]);

describe("M11 Trash shows items as they were trashed", () => {
  it("hides objects under a folder trashed in the same batch", () => {
    expect(topLevelItems(items).map((item) => item.key).sort()).toEqual([
      `.coffer-trash/${BATCH}/a/`,
      `.coffer-trash/${BATCH}/loose.txt`,
      `.coffer-trash/${OTHER}/a/b/c.txt`,
    ]);
  });

  it("a folder row takes its contents along for Delete forever", () => {
    const folder = items.filter((item) => item.key === `.coffer-trash/${BATCH}/a/`);
    expect(withDescendants(folder, items).map((item) => item.key).sort()).toEqual([
      `.coffer-trash/${BATCH}/a/`,
      `.coffer-trash/${BATCH}/a/b/`,
      `.coffer-trash/${BATCH}/a/b/c.txt`,
      `.coffer-trash/${BATCH}/a/top.txt`,
    ]);
  });

  it("a batch's own placeholder hides nothing", () => {
    const withPlaceholder = toTrashItems("", [{ key: `.coffer-trash/${OTHER}/`, size: 0 }, { key: `.coffer-trash/${OTHER}/x.txt`, size: 1 }]);
    expect(topLevelItems(withPlaceholder).map((item) => item.key).sort()).toEqual([`.coffer-trash/${OTHER}/`, `.coffer-trash/${OTHER}/x.txt`]);
    expect(withDescendants(withPlaceholder.filter((item) => item.folder), withPlaceholder)).toHaveLength(1);
  });
});
