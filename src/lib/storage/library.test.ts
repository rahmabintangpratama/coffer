import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeSharedDb, DB_NAME, unsealDbForTests } from "./db";
import { addStars, carryLibrary, clearRecent, followStars, listRecent, listStarred, RECENT_LIMIT, recordRecent, removeStars } from "./library";

beforeEach(async () => {
  unsealDbForTests();
  await closeSharedDb();
  await deleteDB(DB_NAME);
});

const star = (key: string, connectionId = "c1", bucket = "b") => ({ connectionId, bucket, key, kind: key.endsWith("/") ? ("folder" as const) : ("file" as const) });
const keys = async (connectionId = "c1", bucket = "b") => (await listStarred(connectionId, bucket)).map((item) => item.key).sort();

describe("FR-80 starred", () => {
  it("AC-80.1 adds and removes stars for one connection and bucket only", async () => {
    await addStars([star("a.txt"), star("docs/"), star("x.txt", "c2"), star("y.txt", "c1", "other")]);
    expect(await keys()).toEqual(["a.txt", "docs/"]);
    await removeStars("c1", "b", ["a.txt"]);
    expect(await keys()).toEqual(["docs/"]);
    expect(await keys("c2")).toEqual(["x.txt"]);
  });

  it("AC-80.2 a star follows a rename and a folder move, and goes with a trash", async () => {
    await addStars([star("a.txt"), star("docs/"), star("docs/inner.txt"), star("docsx.txt")]);
    await followStars("c1", "b", "a.txt", "renamed.txt");
    await followStars("c1", "b", "docs/", "archive/docs/");
    expect(await keys()).toEqual(["archive/docs/", "archive/docs/inner.txt", "docsx.txt", "renamed.txt"]);
    await followStars("c1", "b", "archive/docs/", null);
    expect(await keys()).toEqual(["docsx.txt", "renamed.txt"]);
  });
});

describe("FR-81 recent", () => {
  it("AC-81.1 records opens newest first, once per key", async () => {
    await recordRecent({ connectionId: "c1", bucket: "b", key: "a.txt", name: "a.txt", fileKind: "code" }, new Date("2026-01-01T00:00:00Z"));
    await recordRecent({ connectionId: "c1", bucket: "b", key: "b.png", name: "b.png", fileKind: "image" }, new Date("2026-01-02T00:00:00Z"));
    await recordRecent({ connectionId: "c1", bucket: "b", key: "a.txt", name: "a.txt", fileKind: "code" }, new Date("2026-01-03T00:00:00Z"));
    expect((await listRecent("c1", "b")).map((item) => item.key)).toEqual(["a.txt", "b.png"]);
  });

  it(`keeps the ${RECENT_LIMIT.toString()} latest per connection and can be cleared`, async () => {
    for (let index = 0; index < RECENT_LIMIT + 3; index += 1) {
      await recordRecent({ connectionId: "c1", bucket: "b", key: `f${index.toString()}`, name: `f${index.toString()}`, fileKind: "unknown" }, new Date(Date.UTC(2026, 0, 1, 0, index)));
    }
    const list = await listRecent("c1", "b");
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]?.key).toBe(`f${(RECENT_LIMIT + 2).toString()}`);
    expect(list.some((item) => item.key === "f0")).toBe(false);
    await clearRecent("c1", "b");
    expect(await listRecent("c1", "b")).toEqual([]);
  });
});

describe("AC-11.6 carrying Starred and Recent to an edited connection", () => {
  it("copies the rows of the bucket under the start folder, and counts without writing", async () => {
    await addStars([star("docs/a.txt"), star("other/b.txt"), star("docs/c.txt", "c1", "elsewhere")]);
    await recordRecent({ connectionId: "c1", bucket: "b", key: "docs/a.txt", name: "a.txt", fileKind: "code" });
    await expect(carryLibrary("c1", "b", "docs/")).resolves.toEqual({ starred: 1, recent: 1 });
    expect(await keys("c2")).toEqual([]);
    await carryLibrary("c1", "b", "docs/", "c2");
    expect(await keys("c2")).toEqual(["docs/a.txt"]);
    expect((await listRecent("c2", "b")).map((item) => item.key)).toEqual(["docs/a.txt"]);
    expect(await keys("c1")).toEqual(["docs/a.txt", "other/b.txt"]);
  });
});
