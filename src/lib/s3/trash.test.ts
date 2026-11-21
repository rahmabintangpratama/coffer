import { describe, expect, it } from "vitest";
import { batchPrefixOf, batchTime, newBatchId, parseTrashKey, trashKeyOf } from "./trash";

// FR-36, FR-70, C-19: the batch id, the trash key and how they are read back.
describe("trash batch ids (C-19)", () => {
  it("formats UTC time and six base-36 characters", () => {
    expect(newBatchId(new Date("2026-11-22T09:05:03.456Z"), () => [0, 1, 10, 35, 9, 20])).toBe("20261122T090503Z-01az9k");
    expect(newBatchId()).toMatch(/^\d{8}T\d{6}Z-[0-9a-z]{6}$/);
  });

  it("reads the time back, and refuses a name that is not ours", () => {
    expect(batchTime("20261122T090503Z-01az9k")?.toISOString()).toBe("2026-11-22T09:05:03.000Z");
    expect(batchTime("holiday")).toBeNull();
    expect(batchTime("20261322T090503Z-01az9k")).toBeNull();
    expect(batchTime("20261122T090503Z-01AZ9K")).toBeNull();
  });

  it("two ids made in the same second differ", () => {
    const now = new Date("2026-11-22T09:05:03Z");
    expect(newBatchId(now)).not.toBe(newBatchId(now));
  });
});

describe("trash keys", () => {
  const batch = "20261122T090503Z-01az9k";

  it("puts the key under the batch prefix, relative to the connection root", () => {
    expect(batchPrefixOf("", batch)).toBe(`.coffer-trash/${batch}/`);
    expect(trashKeyOf("", batch, "docs/a.txt")).toBe(`.coffer-trash/${batch}/docs/a.txt`);
    expect(trashKeyOf("team/", batch, "team/docs/a.txt")).toBe(`team/.coffer-trash/${batch}/docs/a.txt`);
    expect(trashKeyOf("team/", batch, "team/docs/")).toBe(`team/.coffer-trash/${batch}/docs/`);
  });

  it("parses a trash key into batch, time and original key, and round-trips", () => {
    for (const root of ["", "team/"]) {
      const key = `${root}docs/a b#.txt`;
      const parsed = parseTrashKey(root, trashKeyOf(root, batch, key));
      expect(parsed).toMatchObject({ batch, original: key });
      expect(parsed?.deletedAt.toISOString()).toBe("2026-11-22T09:05:03.000Z");
    }
  });

  it("keeps a folder placeholder's trailing slash", () => {
    expect(parseTrashKey("", `.coffer-trash/${batch}/docs/`)?.original).toBe("docs/");
  });

  it("treats a key outside the trash, or under it but not in our batch format, as none (C-19)", () => {
    expect(parseTrashKey("", "docs/a.txt")).toBeNull();
    expect(parseTrashKey("", ".trash/" + batch + "/a.txt")).toBeNull();
    expect(parseTrashKey("team/", ".coffer-trash/x/a.txt")).toBeNull();
    expect(parseTrashKey("", ".coffer-trash/holiday/a.txt")).toBeNull();
    expect(parseTrashKey("", ".coffer-trash/loose.txt")).toBeNull();
    expect(parseTrashKey("", `.coffer-trash/${batch}`)).toBeNull();
    expect(parseTrashKey("", `.coffer-trash/${batch.toUpperCase()}/a.txt`)).toBeNull();
  });
});
