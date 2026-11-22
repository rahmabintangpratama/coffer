// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { trashKeyOf } from "@/lib/s3/trash";
import { toTrashItems } from "./model";
import { planRestore, type RestoreDeps } from "./restore";

// AC-70.3 and the M10 security audit: Restore on a folder row must not carry its subtree back over existing keys unasked.
const BATCH = "20260101T000000Z-abc123";
const trashed = (key: string) => ({ key: trashKeyOf("", BATCH, key), size: key.endsWith("/") ? 0 : 1 });

const deps = (present: string[], choice: "replace" | "skip" = "skip"): RestoreDeps & { ask: ReturnType<typeof vi.fn> } => ({
  existing: (keys) => Promise.resolve(new Set(keys.filter((key) => present.includes(key)))),
  exists: (key) => Promise.resolve(present.includes(key)),
  ask: vi.fn(() => Promise.resolve({ choice, applyToAll: false })),
});

describe("planRestore with a folder row", () => {
  const all = toTrashItems("", [trashed("prod/"), trashed("prod/x"), trashed("prod/y"), trashed("other.txt")]);
  const folder = all.filter((item) => item.folder);

  it("AC-70.3 asks about an existing key under the folder and honours Skip", async () => {
    const d = deps(["prod/x"], "skip");
    const moves = await planRestore(folder, all, "", d);
    expect(d.ask).toHaveBeenCalledTimes(1);
    expect(d.ask.mock.calls[0]?.[0]).toMatchObject({ key: "prod/x" });
    // Nothing moves as a prefix, so the skipped object cannot be carried back and overwrite prod/x.
    expect(moves.map((move) => move.source.endsWith("/"))).toEqual([false]);
    expect(moves.map((move) => move.target)).toEqual(["prod/y"]);
  });

  it("restores every object under the folder one by one when nothing clashes, and leaves the unselected object alone", async () => {
    const moves = await planRestore(folder, all, "", deps([]));
    expect(moves.map((move) => move.target).sort()).toEqual(["prod/x", "prod/y"]);
  });

  it("an empty folder placeholder goes back as itself", async () => {
    const both = toTrashItems("", [trashed("empty/"), trashed("other.txt")]);
    const lone = both.filter((item) => item.folder);
    const moves = await planRestore(lone, both, "", deps([]));
    expect(moves).toEqual([{ source: trashKeyOf("", BATCH, "empty/"), target: "empty/" }]);
  });

  it("a whole batch with no clash still moves back as one prefix", async () => {
    const moves = await planRestore(all, all, "", deps([]));
    expect(moves).toEqual([{ source: `.coffer-trash/${BATCH}/`, target: "" }]);
  });
});
